'use client';

import React, { useState, useCallback } from 'react';

interface User {
  id: string;
  email: string;
  name?: string;
}

interface DashboardPanelProps {
  user: User;
  walletBalance?: number;
}

export default function DashboardPanel({ user, walletBalance = 0 }: DashboardPanelProps) {
  // Compact state hooks for deposit modal
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  /**
   * Cleanup function: Reset all modal inputs and state
   * Called when modal closes or after successful payment initialization
   */
  const resetModalState = useCallback(() => {
    setDepositAmount('');
    setPhoneNumber('');
    setErrorMessage('');
    setSuccessMessage('');
    setIsDepositModalOpen(false);
  }, []);

  /**
   * INITIALIZATION FUNCTION CALL (THE PROCESS CALL)
   * Handles the payment initialization workflow with Paystack
   */
  const handleInitiateDeposit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate inputs
    if (!depositAmount || parseFloat(depositAmount) <= 0) {
      setErrorMessage('Please enter a valid amount');
      return;
    }

    if (!phoneNumber || phoneNumber.trim().length < 10) {
      setErrorMessage('Please enter a valid phone number');
      return;
    }

    // Set processing state to true
    setIsProcessing(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      // POST request to the newly created server endpoint
      const response = await fetch('/api/payments/initialize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: parseFloat(depositAmount),
          email: user.email,
          userId: user.id,
        }),
      });

      // Parse the response
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to initialize payment');
      }

      // Verify response contains the authorization URL
      if (!data.authorizationUrl) {
        throw new Error('Invalid response from payment service');
      }

      // Show success message briefly before redirect
      setSuccessMessage('Redirecting to payment gateway...');

      // Immediately route browser to Paystack authorization URL
      setTimeout(() => {
        window.location.href = data.authorizationUrl;
      }, 1000);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'An unexpected error occurred';
      setErrorMessage(errorMsg);
      console.error('Payment initialization error:', error);
    } finally {
      // Reset processing state
      setIsProcessing(false);
    }
  };

  /**
   * Handle modal close with cleanup
   */
  const handleCloseModal = () => {
    resetModalState();
  };

  /**
   * Handle MTN badge click to open deposit modal
   */
  const handleOpenDepositModal = () => {
    setIsDepositModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      {/* Header Section */}
      <div className="max-w-6xl mx-auto mb-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">
          Welcome, {user.name || user.email}
        </h1>
        <p className="text-slate-600">Manage your wallet and payments</p>
      </div>

      {/* Main Dashboard Grid */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Wallet Balance Card */}
        <div
          onClick={handleOpenDepositModal}
          className="bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow cursor-pointer border-2 border-transparent hover:border-blue-400"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-800">Wallet Balance</h2>
            <svg
              className="w-6 h-6 text-blue-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div className="mb-4">
            <p className="text-4xl font-bold text-slate-900">
              GH₵ {walletBalance.toFixed(2)}
            </p>
            <p className="text-sm text-slate-500 mt-1">Click to add funds</p>
          </div>
          <div className="flex gap-2 text-xs text-slate-600">
            <span className="bg-slate-100 px-2 py-1 rounded">Available Balance</span>
          </div>
        </div>

        {/* MTN Mobile Money Status Card */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-800">Payment Methods</h2>
            <svg
              className="w-6 h-6 text-green-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>

          {/* MTN Mobile Money Badge */}
          <button
            onClick={handleOpenDepositModal}
            className="w-full bg-gradient-to-r from-yellow-300 to-yellow-400 hover:from-yellow-400 hover:to-yellow-500 text-slate-900 font-semibold py-3 px-4 rounded-lg transition-all transform hover:scale-105 active:scale-95 mb-3 flex items-center justify-between"
          >
            <span className="flex items-center gap-2">
              <svg
                className="w-5 h-5"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
              </svg>
              MTN Mobile Money Connected
            </span>
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>

          <p className="text-sm text-slate-600">
            Use MTN Mobile Money to instantly deposit funds into your wallet
          </p>
        </div>
      </div>

      {/* Deposit Modal Overlay */}
      {isDepositModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full p-6 transform transition-all">
            {/* Modal Header */}
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-slate-900">Deposit Funds</h3>
              <button
                onClick={handleCloseModal}
                className="text-slate-500 hover:text-slate-700 transition-colors"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
                <p className="text-sm font-medium">{errorMessage}</p>
              </div>
            )}

            {/* Success Message */}
            {successMessage && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-4">
                <p className="text-sm font-medium">{successMessage}</p>
              </div>
            )}

            {/* Deposit Form */}
            <form onSubmit={handleInitiateDeposit} className="space-y-4">
              {/* Amount Input */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Amount (GH₵)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-3 text-slate-500 font-semibold">
                    GH₵
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    disabled={isProcessing}
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1">Minimum: GH₵ 1.00</p>
              </div>

              {/* Phone Number Input */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Phone Number
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-3 text-slate-500 font-semibold">
                    +233
                  </span>
                  <input
                    type="tel"
                    placeholder="5XXXXXXXXX"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="w-full pl-16 pr-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    disabled={isProcessing}
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1">MTN Ghana number (10 digits)</p>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isProcessing}
                className={`w-full py-3 px-4 rounded-lg font-semibold text-white transition-all transform ${
                  isProcessing
                    ? 'bg-slate-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 active:scale-95'
                }`}
              >
                {isProcessing ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg
                      className="w-4 h-4 animate-spin"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                    Processing...
                  </span>
                ) : (
                  'Proceed to Payment'
                )}
              </button>

              {/* Cancel Button */}
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={isProcessing}
                className="w-full py-3 px-4 rounded-lg font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </form>

            {/* Security Notice */}
            <div className="mt-6 pt-6 border-t border-slate-200">
              <p className="text-xs text-slate-600 flex items-center gap-2">
                <svg
                  className="w-4 h-4 text-green-500"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
                </svg>
                Your transaction is encrypted and secure
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
