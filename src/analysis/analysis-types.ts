export interface IAnalysisData {
  symbol: string;
  time: number;
  price: number;
  variableValues: { [filter: string]: number | string };
}
