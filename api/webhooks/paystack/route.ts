import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

/**
 * POST /api/webhooks/paystack
 * 
 * Receives and verifies Paystack webhook events. On successful payment (charge.success),
 * records the transaction in the momo_deposits ledger table.
 * 
 * Uses HMAC-SHA512 signature verification to prevent fraudulent requests.
 * 
 * Webhook payload example:
 * {
 *   "event": "charge.success",
 *   "data": {
 *     "reference": "txn_reference_code",
 *     "amount": 15050,  // In subunits (Pesewas)
 *     "metadata": {
 *       "custom_fields": [
 *         {
 *           "value": "user-uuid-here",
 *           "variable_name": "user_id"
 *         }
 *       ]
 *     }
 *   }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Extract the raw request body as text for signature verification
    const rawBody = await request.text();

    // Extract the Paystack signature header
    const paystackSignature = request.headers.get('x-paystack-signature');

    // Verify signature header is present
    if (!paystackSignature) {
      console.warn('Webhook request missing x-paystack-signature header');
      return NextResponse.json(
        { error: 'Missing signature header' },
        { status: 401 }
      );
    }

    // Verify PAYSTACK_SECRET_KEY is configured
    const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!paystackSecretKey) {
      console.error('PAYSTACK_SECRET_KEY is not configured');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Compute HMAC-SHA512 hash of the raw body
    const hash = crypto
      .createHmac('sha512', paystackSecretKey)
      .update(rawBody)
      .digest('hex');

    // Verify the computed hash matches the incoming signature
    if (hash !== paystackSignature) {
      console.warn('Webhook signature verification failed', {
        expected: paystackSignature,
        calculated: hash,
      });
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }

    // Parse the verified body
    let body;
    try {
      body = JSON.parse(rawBody);
    } catch (error) {
      console.error('Failed to parse webhook body:', error);
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }

    // Extract event type and data
    const event = body.event;
    const data = body.data;

    // Listen exclusively for charge.success events
    if (event !== 'charge.success') {
      // Silently ignore other event types (200 OK to acknowledge receipt)
      return NextResponse.json(
        { message: 'Event received and ignored' },
        { status: 200 }
      );
    }

    // Validate the charge.success data structure
    if (!data || typeof data !== 'object') {
      console.error('Invalid charge.success data structure');
      return NextResponse.json(
        { error: 'Invalid data structure' },
        { status: 400 }
      );
    }

    // Extract required fields from the payload
    const reference = data.reference;
    const amountInSubunits = data.amount;
    const metadata = data.metadata;

    // Validate reference
    if (!reference || typeof reference !== 'string') {
      console.error('Missing or invalid reference in charge.success');
      return NextResponse.json(
        { error: 'Missing transaction reference' },
        { status: 400 }
      );
    }

    // Validate amount
    if (!amountInSubunits || typeof amountInSubunits !== 'number' || amountInSubunits <= 0) {
      console.error('Missing or invalid amount in charge.success');
      return NextResponse.json(
        { error: 'Missing or invalid amount' },
        { status: 400 }
      );
    }

    // Extract userId from metadata custom_fields
    let userId: string | null = null;
    if (metadata && metadata.custom_fields && Array.isArray(metadata.custom_fields)) {
      const customField = metadata.custom_fields.find(
        (field: any) => field.variable_name === 'user_id'
      );
      if (customField) {
        userId = customField.value;
      }
    }

    // Validate userId
    if (!userId || typeof userId !== 'string') {
      console.error('Missing or invalid userId in metadata');
      return NextResponse.json(
        { error: 'Missing userId in transaction metadata' },
        { status: 400 }
      );
    }

    // Convert amount from subunits back to normal units (divide by 100)
    const amount = amountInSubunits / 100;

    // Verify Supabase environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      console.error('Supabase configuration is missing');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Initialize Supabase Admin client with service role key
    // This bypasses RLS policies to allow server-side writes
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Execute database record write to momo_deposits ledger table
    const { error: dbError, data: insertedData } = await supabase
      .from('momo_deposits')
      .insert([
        {
          user_id: userId,
          amount,
          reference,
          status: 'success',
        },
      ])
      .select();

    if (dbError) {
      console.error('Database insert error:', {
        code: dbError.code,
        message: dbError.message,
        details: dbError.details,
      });
      return NextResponse.json(
        { error: 'Failed to record transaction in ledger' },
        { status: 500 }
      );
    }

    console.log('Successfully recorded momo deposit:', {
      userId,
      amount,
      reference,
      insertedId: insertedData?.[0]?.id,
    });

    // Return success response
    return NextResponse.json(
      {
        message: 'Webhook processed successfully',
        transactionReference: reference,
      },
      { status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Webhook processing error:', errorMessage);

    return NextResponse.json(
      { error: 'Internal server error during webhook processing' },
      { status: 500 }
    );
  }
}