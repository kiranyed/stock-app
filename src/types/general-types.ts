export type Like<T> = { [K in keyof T]: T[K] extends object ? object : T[K] };

export interface IData {
  [key: string]: string | number;
  symbol: string;
  time: number;
}
