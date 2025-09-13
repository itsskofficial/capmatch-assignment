import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoizedSummaryCard } from '@components/SummaryCard';
import { useMarketData } from '@hooks/useMarketData';
import type { AddressIdentifier } from '@stores/addressStore';
import type { PopulationDataResponse } from '@lib/schemas';

// Mock the dynamic map component
vi.mock('@components/dynamic-map', () => ({
  __esModule: true,
  default: () => <div data-testid="mock-map"></div>,
}));

// Mock the useMarketData hook
vi.mock('@hooks/useMarketData');

const mockedUseMarketData = useMarketData as jest.Mock;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false, // Disable retries for tests
    },
  },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe('SummaryCard', () => {
  const baseProps = {
    addressIdentifier: { id: '1', value: '123 Main St, Anytown, USA' },
    onRemove: () => {},
    onSelect: () => {},
    isAnyModalOpen: false,
  };

  it('renders loading state correctly', () => {
    mockedUseMarketData.mockReturnValue({
      isLoading: true,
      isError: false,
      data: undefined,
      error: null,
    });

    render(<MemoizedSummaryCard {...baseProps} />, { wrapper });
    expect(screen.getByText('Fetching data...')).toBeInTheDocument();
    // Check for skeletons
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
  });

  it('renders success state correctly', () => {
    const mockData: Partial<PopulationDataResponse> = {
      geography_name: 'Census Tract 101, Example County',
      coordinates: { lat: 40, lon: -70 },
      fips: { state: '01', county: '001', tract: '010100' },
      total_population: 5000,
      growth: { cagr: 1.5, period_years: 5, absolute_change: 300, yoy_growth: null },
    };

    mockedUseMarketData.mockReturnValue({
      isLoading: false,
      isError: false,
      data: mockData,
      error: null,
    });

    render(<MemoizedSummaryCard {...baseProps} />, { wrapper });

    expect(screen.getByText(baseProps.addressIdentifier.value)).toBeInTheDocument();
    expect(screen.getByText(mockData.geography_name!)).toBeInTheDocument();
    expect(screen.getByText('5,000')).toBeInTheDocument();
    expect(screen.getByText('1.5')).toBeInTheDocument(); // CAGR
    expect(screen.getByTestId('mock-map')).toBeInTheDocument();
  });

  it('renders error state correctly', () => {
    mockedUseMarketData.mockReturnValue({
      isLoading: false,
      isError: true,
      data: undefined,
      error: new Error('404 Not Found'),
    });

    render(<MemoizedSummaryCard {...baseProps} />, { wrapper });

    expect(screen.getByText(/Could not find data for this address/i)).toBeInTheDocument();
    expect(screen.getByText(/Please check for typos or try a more specific address./i)).toBeInTheDocument();
  });
});