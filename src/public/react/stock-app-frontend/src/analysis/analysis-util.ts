import { IAnalysisState } from "../shared/types";

export function validateAnalysisForm(state: IAnalysisState) {
  let valid = true;
  if (state.filters.length === 0) {
    valid = false;
  }
  for (const filt of state.filters) {
    if (filt.varName) {
      if (filt.varName.indexOf("percent change") > -1 && !filt.timeAgo) {
        valid = false;
      }
    } else {
      valid = false;
    }
    if (!filt.operator) {
      valid = false;
    }
    if (!filt.compareVal) {
      valid = false;
    }
  }
  if (state.dataFilters.length === 0) {
    valid = false;
  }
  for (const filt of state.dataFilters) {
    if (filt.varName) {
      if (filt.varName.indexOf("percent change") > -1 && !filt.timeAgo) {
        valid = false;
      }
    } else {
      valid = false;
    }
  }
  if (!state.startDate || !state.endDate) {
    valid = false;
  } else if (state.startDate >= state.endDate) {
    valid = false;
  }

  if (!state.group) {
    valid = false;
  }

  return valid;
}
