import { PeriodType, MemoryType } from "../constants";

export const initStockNames = () => {
  return {
    [PeriodType.MINUTE]: new Array<string>(),
    [PeriodType.FIVE_MINUTES]: new Array<string>(),
    [PeriodType.TEN_MINUTES]: new Array<string>(),
    [PeriodType.THIRTY_MINUTES]: new Array<string>(),
    [PeriodType.HOUR]: new Array<string>(),
    [PeriodType.DAY]: new Array<string>(),
  };
};

export const initFilterData = () => {
  return {
    [PeriodType.MINUTE]: {},
    [PeriodType.FIVE_MINUTES]: {},
    [PeriodType.TEN_MINUTES]: {},
    [PeriodType.THIRTY_MINUTES]: {},
    [PeriodType.HOUR]: {},
    [PeriodType.DAY]: {},
  };
};

export const initMemories = () => {
  return {
    [PeriodType.MINUTE]: { [MemoryType.PRICE]: {}, [MemoryType.VOLUME]: {} },
    [PeriodType.FIVE_MINUTES]: {
      [MemoryType.PRICE]: {},
      [MemoryType.VOLUME]: {},
    },
    [PeriodType.TEN_MINUTES]: {
      [MemoryType.PRICE]: {},
      [MemoryType.VOLUME]: {},
    },
    [PeriodType.THIRTY_MINUTES]: {
      [MemoryType.PRICE]: {},
      [MemoryType.VOLUME]: {},
    },
    [PeriodType.HOUR]: { [MemoryType.PRICE]: {}, [MemoryType.VOLUME]: {} },
    [PeriodType.DAY]: { [MemoryType.PRICE]: {}, [MemoryType.VOLUME]: {} },
  };
};
