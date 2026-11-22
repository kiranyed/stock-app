export type YahooData = {
  regularMarketPrice: number;
  regularMarketLastPrice?: number;
  averageDailyVolume10Day?: number;
  symbol: string;
  regularMarketVolume?: number;
  marketCap?: number;
};

export interface IAccountPosition {
  instrument: {
    symbol: string;
  };
}

export interface IAccountTransaction {
  activityId: string;
}

export interface SchwabData {
  symbol: string;
  reference?: {
    description?: string;
  };
  quote: {
    lastPrice: number;
    totalVolume: number;
    highPrice: number;
    lowPrice: number;
  };
}

export interface SchwabDataMap {
  [stockName: string]: SchwabData;
}

export type Contract = {
  bid: number;
  ask: number;
  symbol: string;
  strikePrice: number;
};

export interface IOrderData {
  orderId: string;
  status: string;
  cancelable: boolean;
}

export interface IOrder {
  symbol: string;
  orderType: string;
  marketOrder: boolean;
  shares: number;
  price: number;
  option?: boolean;
}

interface Option {
  ask: number;
  putCall: boolean;
  askSize: number;
  bid: number;
  bidSize: number;
  inTheMoney: boolean;
  strikePrice: number;
  symbol: string;
  daysToExpiration: number;
}

export interface IOptionsChain {
  symbol: string;
  strategy: string;
  numberOfContracts: number;
  underlyingPrice: number;
  callExpDateMap: Record<string, Record<string, Option[]>>;
  putExpDateMap: Record<string, Record<string, Option[]>>;
}

export interface SchwabInstrument {
  assetType: "OPTION" | "EQUITY" | "MUTUAL_FUND" | string;
  cusip: string;
  symbol: string;
  description?: string;
  netChange: number;
  type?: string; // "VANILLA" for options, "NO_LOAD_TAXABLE" for mutual funds, etc.
  putCall?: "CALL" | "PUT"; // Only for options
  underlyingSymbol?: string; // Only for options
}

export interface IPosition {
  longQuantity: number;
  shortQuantity: number;
  averagePrice: number;
  currentDayProfitLoss: number;
  currentDayProfitLossPercentage: number;
  settledLongQuantity: number;
  settledShortQuantity: number;
  instrument: SchwabInstrument;
  marketValue: number;
  maintenanceRequirement: number;
  averageLongPrice: number;
  taxLotAverageLongPrice: number;
  longOpenProfitLoss: number;
  previousSessionLongQuantity: number;
  currentDayCost: number;
  agedQuantity?: number; // Optional, appears in some positions
}
