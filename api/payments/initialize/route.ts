import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/payments/initialize
 * 
 * Initializes a Paystack payment transaction by converting currency amounts
 * to the lowest subunit (Pesewas for GHS) and fetching an authorization URL
 * from the Paystack API.
 * 
 * Request body:
 * {
 *   "amount": 150.50,      // Decimal amount in GHS
 *   "email": "user@example.com",
 *   "userId": "uuid-string"
 * }
 * 
 * Response on success (200):
 * {
 *   "authorizationUrl": "https://checkout.paystack.com/..."
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Extract the request body
    const body = await request.json();

    // Extract and validate required fields
    const { amount, email, userId } = body;

    // Validate amount
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json(
        { error: 'Invalid amount: must be a positive number' },
        { status: 400 }
      );
    }

    // Validate email
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400 }
      );
    }

    // Validate userId
    if (!userId || typeof userId !== 'string') {
      return NextResponse.json(
        { error: 'Invalid userId: must be a non-empty string' },
        { status: 400 }
      );
    }

    // Convert decimal amount to lowest subunit (multiply by 100 for Pesewas)
    const amountInSubunits = Math.round(amount * 100);

    // Verify the PAYSTACK_SECRET_KEY environment variable is configured
    const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!paystackSecretKey) {
      console.error('PAYSTACK_SECRET_KEY is not configured');
      return NextResponse.json(
        { error: 'Payment service configuration error' },
        { status: 500 }
      );
    }

    // Prepare the Paystack API request payload
    const paystackPayload = {
      email,
      amount: amountInSubunits,
      metadata: {
        custom_fields: [
          {
            display_name: 'User ID',
            variable_name: 'user_id',
            value: userId,
          },
        ],
      },
    };

    // Make authorized server-to-server request to Paystack API
    const paystackResponse = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${paystackSecretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(paystackPayload),
    });

    // Parse the Paystack response
    const paystackData = await paystackResponse.json();

    if (!paystackResponse.ok) {
      console.error('Paystack API error:', {
        status: paystackResponse.status,
        error: paystackData.message,
      });
      return NextResponse.json(
        { error: paystackData.message || 'Failed to initialize payment' },
        { status: paystackResponse.status || 500 }
      );
    }

    // Verify the response contains the authorization URL
    if (!paystackData.data || !paystackData.data.authorization_url) {
      console.error('Paystack response missing authorization_url:', paystackData);
      return NextResponse.json(
        { error: 'Invalid response from payment service' },
        { status: 500 }
      );
    }

    // Return the authorization URL to the frontend client
    return NextResponse.json(
      {
        authorizationUrl: paystackData.data.authorization_url,
      },
      { status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Payment initialization error:', errorMessage);

    return NextResponse.json(
      { error: 'Internal server error during payment initialization' },
      { status: 500 }
    );
  }
}
