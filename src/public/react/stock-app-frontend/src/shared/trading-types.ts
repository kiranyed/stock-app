export interface IPosition {
  expireIsoDate: string | number | Date;
  selected: boolean;
  longQuantity?: number;
  shortQuantity?: number;
  instrument: { symbol: string; assetType: string };
  marketValue: number;
  averagePrice: number;
  limitPrice: number;
  market: boolean;
  order: string;
  orderQuantity: number;
  purchasePrice: number;
  labels: string;
  longOpenProfitLoss: number;
  currentDayProfitLoss: number;
  currentDayProfitLossPercentage: number;
  expireDate: number;
  
  // 🆕 Position rule fields (optional)
  stopLoss?: number;
  stopLossOnUnderlying?: number;
  target?: number;
  targetOnUnderlying?: number;
  positionRuleId?: number;
}
