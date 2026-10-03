'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

interface User {
  id: string;
  email: string;
  name?: string;
}

interface DashboardPanelProps {
  user: User;
  walletBalance?: number;
}

interface MarketplaceItem {
  id: string;
  product_name: string;
  vendor_name: string;
  category: string;
  price: number;
  price_display: string;
  badge: string;
  image_url: string;
  stock_quantity: number;
  description: string;
  source_channel: string;
}

const PRODUCT_CATEGORIES = [
  'Living Room',
  'Bedroom',
  'Bathroom Accessories',
  'Wallpapers',
  'Phone accessories',
  'Computer accessories',
  'Beauty parlor',
  'Hair',
  'Cloths',
  'Shoes',
  'Bags',
  'Perfumes',
  'Devices',
  'Drones',
  'Overboards',
  'Gaming items',
  'Cosmetics',
  'Food products',
  'Building materials',
];

const FREE_SHIPPING_BADGES = ['FREE DELIVERY', 'FREE SHIPPING'];

export default function DashboardPanel({ user, walletBalance = 0 }: DashboardPanelProps) {
  // Compact state hooks for deposit modal
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Marketplace catalog state
  const [marketplaceItems, setMarketplaceItems] = useState<MarketplaceItem[]>([]);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Initialize Supabase client
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  /**
   * Fetch marketplace inventory from Supabase
   */
  useEffect(() => {
    const fetchMarketplaceItems = async () => {
      try {
        setIsLoadingCatalog(true);
        setCatalogError('');

        const { data, error } = await supabase
          .from('marketplace_inventory')
          .select('*')
          .eq('active', true)
          .order('created_at', { ascending: false });

        if (error) {
          throw new Error(error.message);
        }

        const transformedItems: MarketplaceItem[] = (data || []).map((item: any) => ({
          id: item.id,
          product_name: item.product_name,
          vendor_name: item.vendor_name,
          category: item.category,
          price: item.price,
          price_display: item.price_display || `GH₵ ${item.price.toFixed(2)}`,
          badge: item.badge || 'TRADE PRICE',
          image_url: item.image_url,
          stock_quantity: item.stock_quantity,
          description: item.description,
          source_channel: item.source_channel,
        }));

        setMarketplaceItems(transformedItems);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Failed to fetch catalog';
        setCatalogError(errorMsg);
        console.error('Marketplace fetch error:', error);
      } finally {
        setIsLoadingCatalog(false);
      }
    };

    fetchMarketplaceItems();
  }, [supabase]);

  /**
   * Filter items by selected category or show all
   */
  const filteredItems = selectedCategory
    ? marketplaceItems.filter((item) =>
        item.category.toLowerCase().includes(selectedCategory.toLowerCase())
      )
    : marketplaceItems;

  /**
   * Cleanup function: Reset all modal inputs and state
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header Section */}
      <div className="sticky top-0 z-40 bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <h1 className="text-2xl font-bold text-slate-900 mb-1">
            Welcome, {user.name || user.email}
          </h1>
          <p className="text-sm text-slate-600">Manage your wallet and browse our wholesale catalog</p>
        </div>
      </div>

      {/* Main Dashboard Grid */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Payment Cards Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
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

        {/* Wholesale Catalog Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Wholesale Catalog</h2>
              <p className="text-sm text-slate-600 mt-1">
                Browse {filteredItems.length} products from verified vendors
              </p>
            </div>
          </div>

          {/* Category Filter Pills */}
          <div className="mb-8 pb-6 border-b border-slate-200">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedCategory(null)}
                className={`px-4 py-2 rounded-full font-medium text-sm transition-all ${
                  selectedCategory === null
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                }`}
              >
                All Products
              </button>
              {PRODUCT_CATEGORIES.map((category) => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`px-4 py-2 rounded-full font-medium text-sm transition-all whitespace-nowrap ${
                    selectedCategory === category
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          {/* Catalog Error State */}
          {catalogError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-lg mb-6">
              <p className="font-medium">Error loading catalog</p>
              <p className="text-sm mt-1">{catalogError}</p>
            </div>
          )}

          {/* Loading State */}
          {isLoadingCatalog ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-slate-200 rounded-lg h-80 animate-pulse" />
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-12">
              <svg
                className="w-16 h-16 mx-auto text-slate-300 mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M20 7l-8-4-8 4m0 0l8 4m-8-4v10l8 4m0-10l8 4m-8-4v10M7 9l9 4.5m0 0l9-4.5"
                />
              </svg>
              <p className="text-slate-600 text-lg font-medium">No products found</p>
              <p className="text-slate-500 text-sm">Try selecting a different category</p>
            </div>
          ) : (
            /* Products Grid */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredItems.map((item) => {
                const hasFreeShipping = FREE_SHIPPING_BADGES.some((badge) =>
                  item.badge.toUpperCase().includes(badge)
                );

                return (
                  <div
                    key={item.id}
                    className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow overflow-hidden border border-slate-200 hover:border-blue-300"
                  >
                    {/* Product Image */}
                    <div className="relative bg-slate-100 h-56 overflow-hidden group">
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt={item.product_name}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <svg
                            className="w-12 h-12 text-slate-300"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.5}
                              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                            />
                          </svg>
                        </div>
                      )}

                      {/* Free Shipping Badge */}
                      {hasFreeShipping && (
                        <div className="absolute top-2 right-2 bg-green-500 text-white px-3 py-1 rounded-full text-xs font-bold">
                          FREE SHIPPING
                        </div>
                      )}

                      {/* Badge */}
                      <div className="absolute top-2 left-2 bg-blue-600 text-white px-3 py-1 rounded text-xs font-semibold">
                        {item.badge}
                      </div>

                      {/* Stock Status */}
                      {item.stock_quantity === 0 ? (
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                          <span className="bg-red-600 text-white px-3 py-1 rounded font-semibold text-sm">
                            OUT OF STOCK
                          </span>
                        </div>
                      ) : item.stock_quantity < 5 ? (
                        <div className="absolute bottom-2 right-2 bg-orange-500 text-white px-2 py-1 rounded text-xs font-semibold">
                          {item.stock_quantity} left
                        </div>
                      ) : null}
                    </div>

                    {/* Product Info */}
                    <div className="p-4">
                      {/* Category Tag */}
                      <div className="mb-2">
                        <span className="inline-block bg-slate-100 text-slate-700 text-xs font-medium px-2 py-1 rounded">
                          {item.category}
                        </span>
                      </div>

                      {/* Product Name */}
                      <h3 className="font-semibold text-slate-900 text-base mb-2 line-clamp-2 min-h-[2.5rem]">
                        {item.product_name}
                      </h3>

                      {/* Description */}
                      {item.description && (
                        <p className="text-slate-600 text-xs mb-3 line-clamp-2">
                          {item.description}
                        </p>
                      )}

                      {/* Vendor */}
                      <div className="mb-3">
                        <p className="text-xs text-slate-500">
                          <span className="font-medium">By:</span> {item.vendor_name}
                        </p>
                      </div>

                      {/* Price */}
                      <div className="mb-4 pb-4 border-t border-slate-200 pt-4">
                        <p className="text-2xl font-bold text-slate-900">
                          {item.price_display || `GH₵ ${item.price.toFixed(2)}`}
                        </p>
                        {item.source_channel && (
                          <p className="text-xs text-slate-500 mt-1">
                            Source: {item.source_channel.replace(/_/g, ' ')}
                          </p>
                        )}
                      </div>

                      {/* Action Button */}
                      <button
                        disabled={item.stock_quantity === 0 || isProcessing}
                        className={`w-full py-2 px-3 rounded-lg font-medium text-sm transition-all ${
                          item.stock_quantity === 0 || isProcessing
                            ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                            : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95'
                        }`}
                      >
                        {item.stock_quantity === 0 ? 'Out of Stock' : 'Add to Cart'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
