import React, { useEffect, useMemo, useRef, useState } from "react";
import { AxiosError } from "axios";
import { Button } from "primereact/button";
import { Card } from "primereact/card";
import { InputNumber } from "primereact/inputnumber";
import { InputText } from "primereact/inputtext";
import { RadioButton } from "primereact/radiobutton";
import { Toast } from "primereact/toast";
import { confirmDialog } from "primereact/confirmdialog";
import { Dialog } from "primereact/dialog";
import { Accordion, AccordionTab } from "primereact/accordion";
import {
  StockAppAPI,
  IOptionChainResponse,
  IOptionPreviewResponse,
  IQuoteResponse,
} from "../shared/utilities/stock-app-api";
import { displayError, displaySuccess } from "../shared/toast-util";
import { OptionStrikePrice } from "../shared/enums";

const OPTION_LENGTHS: {
  label: string;
  value: "weeklies" | "shortTerm" | "midTerm" | "longTerm" | "leaps";
}[] = [
  { label: "Weeklies", value: "weeklies" },
  { label: "Short term", value: "shortTerm" },
  { label: "Medium term", value: "midTerm" },
  { label: "Long term", value: "longTerm" },
  { label: "LEAPS", value: "leaps" },
];

const OPTION_AGGRESSIVENESS: { label: string; value: OptionStrikePrice }[] = [
  { label: "Deep ITM", value: OptionStrikePrice.DEEP_ITM },
  { label: "ITM", value: OptionStrikePrice.ITM },
  { label: "ATM", value: OptionStrikePrice.ATM },
  { label: "OTM", value: OptionStrikePrice.OTM },
  { label: "Deep OTM", value: OptionStrikePrice.DEEP_OTM },
];

type ChainSelection = {
  symbol: string;
  strikePrice: number;
  bid: number;
  ask: number;
  mark: number;
  expirationDate: string;
  optionSide: "CALL" | "PUT";
};

type RiskRuleValues = {
  stopLoss: number | undefined;
  stopLossOnUnderlying: number | undefined;
  target: number | undefined;
  targetOnUnderlying: number | undefined;
};

const formatDate = (dateStr: string): string => {
  const d = new Date(`${dateStr.split(":")[0]}T00:00:00`);
  return d.toLocaleDateString("en-US", { month: "long", day: "2-digit", year: "numeric" });
};

const formatMoney = (value: number | null | undefined) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }
  return `$${value.toFixed(2)}`;
};

const formatAccountLabel = (value: string): string => {
  if (!value) {
    return "Trading";
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const getErrorMessage = (err: unknown): string => {
  if (err instanceof AxiosError && err.response?.data?.message) {
    return String(err.response.data.message);
  }
  if (err instanceof Error) {
    return err.message;
  }
  return "An unknown error occurred";
};

const TradeTab: React.FC<{ accountType: string }> = ({ accountType }) => {
  const [symbol, setSymbol] = useState("");
  const [quantity, setQuantity] = useState<number | null>(null);

  const [limit, setLimit] = useState(true);
  const [limitPrice, setLimitPrice] = useState(0);
  const [instrumentType, setInstrumentType] = useState<"stock" | "options">("stock");
  const [debouncedSymbolUpper, setDebouncedSymbolUpper] = useState("");

  const [optionLength, setOptionLength] = useState<
    "weeklies" | "shortTerm" | "midTerm" | "longTerm" | "leaps" | ""
  >("");
  const [optionAggressiveness, setOptionAggressiveness] = useState<OptionStrikePrice | null>(null);

  const [stockQuote, setStockQuote] = useState<IQuoteResponse | null>(null);
  const [stockQuoteError, setStockQuoteError] = useState("");

  const [optionPreview, setOptionPreview] = useState<IOptionPreviewResponse | null>(null);
  const [optionPreviewError, setOptionPreviewError] = useState("");
  const [optionQuote, setOptionQuote] = useState<IQuoteResponse | null>(null);
  const [optionQuoteError, setOptionQuoteError] = useState("");
  const [optionsChainDialogVisible, setOptionsChainDialogVisible] = useState(false);
  const [optionsChainLoading, setOptionsChainLoading] = useState(false);
  const [optionsChainError, setOptionsChainError] = useState("");
  const [optionsChainData, setOptionsChainData] = useState<IOptionChainResponse | null>(null);
  const [chainSelectionDraft, setChainSelectionDraft] = useState<ChainSelection | null>(null);
  const [selectedContract, setSelectedContract] = useState<ChainSelection | null>(null);
  const [selectedContractIsManual, setSelectedContractIsManual] = useState(false);

  const [stopLoss, setStopLoss] = useState<number | undefined>();
  const [stopLossOnUnderlying, setStopLossOnUnderlying] = useState<number | undefined>();
  const [target, setTarget] = useState<number | undefined>();
  const [targetOnUnderlying, setTargetOnUnderlying] = useState<number | undefined>();

  const toast = useRef<Toast>(null);
  const stopLossInputRef = useRef<HTMLInputElement | null>(null);
  const stopLossUnderlyingInputRef = useRef<HTMLInputElement | null>(null);
  const targetInputRef = useRef<HTMLInputElement | null>(null);
  const targetUnderlyingInputRef = useRef<HTMLInputElement | null>(null);

  const symbolUpper = useMemo(() => symbol.replace(/\s+/g, "").toUpperCase(), [symbol]);

  const parseNumberFromInput = (rawValue?: string): number | undefined => {
    if (!rawValue) {
      return undefined;
    }
    const normalized = rawValue.replace(/[^0-9.-]/g, "");
    if (!normalized || normalized === "-" || normalized === "." || normalized === "-.") {
      return undefined;
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const getCurrentRiskRuleValues = (): RiskRuleValues => ({
    stopLoss: parseNumberFromInput(stopLossInputRef.current?.value) ?? stopLoss,
    stopLossOnUnderlying:
      parseNumberFromInput(stopLossUnderlyingInputRef.current?.value) ?? stopLossOnUnderlying,
    target: parseNumberFromInput(targetInputRef.current?.value) ?? target,
    targetOnUnderlying:
      parseNumberFromInput(targetUnderlyingInputRef.current?.value) ?? targetOnUnderlying,
  });

  const previewToChainSelection = (preview: IOptionPreviewResponse): ChainSelection => {
    const sym = preview.contractSymbol.replace(/ /g, "");
    const optionSide: "CALL" | "PUT" = /\d{6}C\d/.test(sym) ? "CALL" : "PUT";
    return {
      symbol: preview.contractSymbol,
      strikePrice: preview.strikePrice,
      bid: preview.bid,
      ask: preview.ask,
      mark: preview.midpoint,
      expirationDate: preview.expirationDate,
      optionSide,
    };
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSymbolUpper(symbolUpper);
    }, 400);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [symbolUpper]);

  const stockMidpoint = useMemo(() => {
    if (!stockQuote) {
      return null;
    }
    if (typeof stockQuote.bid === "number" && typeof stockQuote.ask === "number") {
      return (stockQuote.bid + stockQuote.ask) / 2;
    }
    return stockQuote.mark ?? stockQuote.last;
  }, [stockQuote]);

  const optionMidpoint = useMemo(() => {
    if (!selectedContract) {
      return null;
    }

    const bid = optionQuote?.bid ?? selectedContract.bid;
    const ask = optionQuote?.ask ?? selectedContract.ask;
    if (typeof bid === "number" && typeof ask === "number") {
      return (bid + ask) / 2;
    }

    if (typeof selectedContract.mark === "number" && Number.isFinite(selectedContract.mark)) {
      return selectedContract.mark;
    }

    return null;
  }, [optionQuote?.ask, optionQuote?.bid, selectedContract]);

  const orderAmount = useMemo(() => {
    const qty = Math.floor(quantity ?? 0);
    if (qty <= 0) {
      return null;
    }

    if (instrumentType === "stock") {
      const unitPrice = limit ? limitPrice : stockMidpoint;
      if (typeof unitPrice !== "number" || !Number.isFinite(unitPrice) || unitPrice <= 0) {
        return null;
      }
      return qty * unitPrice;
    }

    const optionUnitPrice = limit ? limitPrice : optionMidpoint;
    if (typeof optionUnitPrice !== "number" || !Number.isFinite(optionUnitPrice) || optionUnitPrice <= 0) {
      return null;
    }
    return qty * optionUnitPrice * 100;
  }, [instrumentType, limit, limitPrice, optionMidpoint, quantity, stockMidpoint]);

  const orderAmountLabel = limit ? "Order Amount" : "Estimated Amount";

  // Auto-fill limit price when stock midpoint changes and limit order is selected
  useEffect(() => {
    if (instrumentType !== "stock") {
      return;
    }
    if (limit && stockMidpoint && stockMidpoint > 0) {
      setLimitPrice(parseFloat(stockMidpoint.toFixed(2)));
    }
  }, [stockMidpoint, limit, instrumentType]);

  // Auto-set selectedContract from optionPreview when no manual selection
  useEffect(() => {
    if (!optionPreview || selectedContractIsManual) return;
    setSelectedContract(previewToChainSelection(optionPreview));
  }, [optionPreview, selectedContractIsManual]);

  // Auto-fill limit price from selected contract bid/ask midpoint in options mode
  useEffect(() => {
    if (instrumentType !== "options" || !selectedContract || !limit) return;
    const mid = (selectedContract.bid + selectedContract.ask) / 2;
    if (mid > 0) {
      setLimitPrice(parseFloat(mid.toFixed(2)));
    }
  }, [selectedContract, instrumentType, limit]);

  const createPositionRule = async (
    accountType: string = "trading",
    riskValues?: RiskRuleValues,
  ) => {
    try {
      const currentRiskValues = riskValues ?? getCurrentRiskRuleValues();

      if (
        !currentRiskValues.stopLoss &&
        !currentRiskValues.stopLossOnUnderlying &&
        !currentRiskValues.target &&
        !currentRiskValues.targetOnUnderlying
      ) {
        return;
      }

      const ruleSymbol =
        instrumentType === "options"
          ? selectedContract?.symbol.replace(/ /g, "").toUpperCase()
          : symbolUpper;

      if (!ruleSymbol) {
        toast.current?.show({
          severity: "warn",
          summary: "Warning",
          detail:
            "Trade succeeded but no option contract was selected for rule creation.",
          life: 5000,
        });
        return;
      }

      const positions = await StockAppAPI.getAccountPositions(accountType);
      const positionExists = positions.positions?.some(
        (pos) => pos.instrument.symbol.replace(/ /g, "").toUpperCase() === ruleSymbol,
      );

      if (!positionExists) {
        toast.current?.show({
          severity: "warn",
          summary: "Warning",
          detail:
            "Position not found in account. Position rule was not created. You can add it manually from the Positions tab.",
          life: 5000,
        });
        return;
      }

      await StockAppAPI.updatePositionRule(
        {
          symbol: ruleSymbol,
          option: instrumentType === "options" ? ruleSymbol : undefined,
          stopLoss: currentRiskValues.stopLoss,
          stopLossOnUnderlying: currentRiskValues.stopLossOnUnderlying,
          target: currentRiskValues.target,
          targetOnUnderlying: currentRiskValues.targetOnUnderlying,
        },
        accountType,
      );

      displaySuccess(toast, "Position rule created", { life: 3000 });
    } catch {
      toast.current?.show({
        severity: "warn",
        summary: "Position Rule Failed",
        detail: "Trade succeeded but position rule could not be created. Try adding it manually.",
        life: 5000,
      });
    }
  };

  const handleInstrumentTypeChange = (nextType: "stock" | "options") => {
    setInstrumentType(nextType);
    if (nextType === "stock") {
      setOptionLength("");
      setOptionAggressiveness(null);
      setOptionPreview(null);
      setOptionPreviewError("");
      setOptionQuote(null);
      setOptionQuoteError("");
      setSelectedContract(null);
      setSelectedContractIsManual(false);
      setChainSelectionDraft(null);
      setOptionsChainData(null);
      setOptionsChainError("");
    } else {
      setLimitPrice(0);
    }
  };

  useEffect(() => {
    if (instrumentType !== "options") {
      return;
    }
    setSelectedContract(null);
    setSelectedContractIsManual(false);
    setChainSelectionDraft(null);
    setOptionsChainData(null);
    setOptionsChainError("");
  }, [debouncedSymbolUpper, instrumentType]);

  useEffect(() => {
    if (!debouncedSymbolUpper) {
      setStockQuote(null);
      setStockQuoteError("");
      return;
    }

    let isActive = true;

    const fetchQuote = async () => {
      try {
        const data = await StockAppAPI.getQuote(debouncedSymbolUpper);
        if (!isActive) {
          return;
        }
        setStockQuote(data);
        setStockQuoteError("");
      } catch (err) {
        if (!isActive) {
          return;
        }
        setStockQuote(null);
        setStockQuoteError(getErrorMessage(err));
      }
    };

    fetchQuote();
    const intervalId = window.setInterval(fetchQuote, 5000);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
    };
  }, [debouncedSymbolUpper]);

  useEffect(() => {
    if (
      instrumentType !== "options" ||
      !debouncedSymbolUpper ||
      !optionLength ||
      !optionAggressiveness
    ) {
      setOptionPreview(null);
      setOptionPreviewError("");
      return;
    }

    let isActive = true;

    const fetchPreview = async () => {
      try {
        const preview = await StockAppAPI.previewOptionTrade({
          symbol: debouncedSymbolUpper,
          quantity: quantity ?? 0,
          optionLength,
          optionAggressiveness,
        });
        if (!isActive) {
          return;
        }
        setOptionPreview(preview);
        setOptionPreviewError("");
      } catch (err) {
        if (!isActive) {
          return;
        }
        setOptionPreview(null);
        setOptionQuote(null);
        setOptionPreviewError(getErrorMessage(err));
      }
    };

    fetchPreview();

    return () => {
      isActive = false;
    };
  }, [
    quantity,
    instrumentType,
    optionAggressiveness,
    optionLength,
    debouncedSymbolUpper,
  ]);

  const openOptionsChainDialog = async () => {
    if (!symbolUpper) {
      toast.current?.show({
        severity: "error",
        summary: "Validation Error",
        detail: "Enter a symbol before viewing the options chain",
      });
      return;
    }

    setOptionsChainDialogVisible(true);
    setOptionsChainLoading(true);
    setOptionsChainError("");
    try {
      const chain = await StockAppAPI.getOptionsChain(symbolUpper);
      setOptionsChainData(chain);
      if (selectedContract) {
        setChainSelectionDraft(selectedContract);
      }
    } catch (err) {
      setOptionsChainError(getErrorMessage(err));
      setOptionsChainData(null);
    } finally {
      setOptionsChainLoading(false);
    }
  };

  const confirmOptionsChainSelection = () => {
    if (!chainSelectionDraft) {
      toast.current?.show({
        severity: "warn",
        summary: "No Contract Selected",
        detail: "Select a contract from the options chain first",
      });
      return;
    }

    setSelectedContract(chainSelectionDraft);
    setSelectedContractIsManual(true);
    setOptionsChainDialogVisible(false);
  };

  const resetForm = () => {
    setSymbol("");
    setQuantity(null);
    setLimit(true);
    setLimitPrice(0);
    setInstrumentType("stock");
    setOptionLength("");
    setOptionAggressiveness(null);
    setSelectedContract(null);
    setSelectedContractIsManual(false);
    setStopLoss(undefined);
    setStopLossOnUnderlying(undefined);
    setTarget(undefined);
    setTargetOnUnderlying(undefined);
    setStockQuote(null);
    setStockQuoteError("");
    setOptionPreview(null);
    setOptionPreviewError("");
    setOptionQuote(null);
    setOptionQuoteError("");
    setOptionsChainDialogVisible(false);
    setChainSelectionDraft(null);
    setOptionsChainData(null);
    setOptionsChainError("");
  };

  useEffect(() => {
    if (instrumentType !== "options" || !selectedContract?.symbol) {
      setOptionQuote(null);
      setOptionQuoteError("");
      return;
    }

    const contractSymbol = selectedContract.symbol;
    let isActive = true;

    const fetchOptionQuote = async () => {
      try {
        const data = await StockAppAPI.getQuote(contractSymbol);
        if (!isActive) {
          return;
        }
        setOptionQuote(data);
        setOptionQuoteError("");
      } catch (err) {
        if (!isActive) {
          return;
        }
        setOptionQuote(null);
        setOptionQuoteError(getErrorMessage(err));
      }
    };

    fetchOptionQuote();
    const intervalId = window.setInterval(fetchOptionQuote, 5000);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
    };
  }, [instrumentType, selectedContract?.symbol]);

  const validateForm = (riskValues?: RiskRuleValues): string | null => {
    if (!symbolUpper) {
      return "Symbol is required";
    }
    if (!Number.isFinite(quantity) || (quantity ?? 0) <= 0) {
      return "Quantity must be greater than 0";
    }

    if (instrumentType === "stock") {
      if (limit && (!Number.isFinite(limitPrice) || limitPrice <= 0)) {
        return "Limit price must be greater than 0";
      }
      if (stockQuoteError) {
        return stockQuoteError;
      }
    }

    if (instrumentType === "options") {
      if (!selectedContract) {
        return "Select a contract using Quick Contract Lookup or View Options Chain";
      }
    }

    // Use ref-committed values when available (avoids stale state from focused inputs)
    const sl = riskValues?.stopLoss ?? stopLoss;
    const tgt = riskValues?.target ?? target;
    const slUnderlying = riskValues?.stopLossOnUnderlying ?? stopLossOnUnderlying;
    const tgtUnderlying = riskValues?.targetOnUnderlying ?? targetOnUnderlying;

    // --- Risk rule validation ---
    const currentPrice =
      instrumentType === "stock"
        ? stockMidpoint
        : optionMidpoint;

    if (sl != null) {
      if (sl <= 0) {
        return "Stop Loss must be a positive value";
      }
      if (currentPrice != null && sl >= currentPrice) {
        return `Stop Loss ($${sl.toFixed(2)}) must be below the current price ($${currentPrice.toFixed(2)})`;
      }
    }

    if (tgt != null) {
      if (tgt <= 0) {
        return "Target must be a positive value";
      }
      if (currentPrice != null && tgt <= currentPrice) {
        return `Target ($${tgt.toFixed(2)}) must be above the current price ($${currentPrice.toFixed(2)})`;
      }
    }

    if (sl != null && tgt != null && sl >= tgt) {
      return "Stop Loss must be less than Target";
    }

    if (instrumentType === "options") {
      const underlyingPrice = stockMidpoint;

      if (slUnderlying != null) {
        if (slUnderlying <= 0) {
          return "Stop Loss (Underlying) must be a positive value";
        }
        if (underlyingPrice != null && slUnderlying >= underlyingPrice) {
          return `Stop Loss (Underlying) ($${slUnderlying.toFixed(2)}) must be below the underlying price ($${underlyingPrice.toFixed(2)})`;
        }
      }

      if (tgtUnderlying != null) {
        if (tgtUnderlying <= 0) {
          return "Target (Underlying) must be a positive value";
        }
        if (underlyingPrice != null && tgtUnderlying <= underlyingPrice) {
          return `Target (Underlying) ($${tgtUnderlying.toFixed(2)}) must be above the underlying price ($${underlyingPrice.toFixed(2)})`;
        }
      }

      if (slUnderlying != null && tgtUnderlying != null && slUnderlying >= tgtUnderlying) {
        return "Stop Loss (Underlying) must be less than Target (Underlying)";
      }
    }

    return null;
  };

  const submitOrder = async () => {
    const currentRiskValues = getCurrentRiskRuleValues();

    if (instrumentType === "stock") {
      const shares = Math.floor(quantity ?? 0);
      if (shares <= 0) {
        throw new Error("Quantity must be at least 1");
      }

      const orderPrice = limit ? limitPrice : (stockMidpoint ?? 0);
      if (limit && orderPrice <= 0) {
        throw new Error("Limit price must be greater than 0");
      }

      await StockAppAPI.makeOrders(
        [
          {
            symbol: symbolUpper,
            orderType: "BUY",
            marketOrder: !limit,
            shares,
            price: orderPrice,
            option: false,
          },
        ],
        accountType,
      );

      await createPositionRule(accountType, currentRiskValues);
      displaySuccess(toast, "Successfully placed stock order");
      resetForm();
      return;
    }

    if (!selectedContract) {
      throw new Error("No contract selected");
    }

    await StockAppAPI.makeOptionsTrades({
      quantity: Math.floor(quantity ?? 0),
      marketOrder: !limit,
      limitPrice: limit ? limitPrice : undefined,
      symbol: symbolUpper,
      contractSymbol: selectedContract.symbol,
      optionAggressiveness: !selectedContractIsManual ? (optionAggressiveness ?? undefined) : undefined,
      optionLength: !selectedContractIsManual ? (optionLength || undefined) : undefined,
    }, accountType);

    await createPositionRule(accountType, currentRiskValues);
    displaySuccess(toast, "Successfully placed options order");
    resetForm();
  };

  const confirmPlaceOrder = () => {
    const currentRiskValues = getCurrentRiskRuleValues();

    const validationError = validateForm(currentRiskValues);
    if (validationError) {
      toast.current?.show({
        severity: "error",
        summary: "Validation Error",
        detail: validationError,
      });
      return;
    }

    const estimatedQuantity = Math.floor(quantity ?? 0);
    confirmDialog({
      header: "Confirm Order",
      icon: "pi pi-exclamation-triangle",
      message: (
        <div>
          <div><strong>Account:</strong> {formatAccountLabel(accountType)}</div>
          <div><strong>Instrument:</strong> {symbolUpper}</div>
          <div><strong>Type:</strong> {instrumentType === "stock" ? "Stock" : "Option"}</div>
          {instrumentType === "stock" ? (
            <>
              <div><strong>Order:</strong> {limit ? "Limit" : "Market"}</div>
              <div><strong>Price:</strong> {limit ? formatMoney(limitPrice) : "Market"}</div>
            </>
          ) : (
            <>
              <div><strong>Contract:</strong> {selectedContract?.symbol ?? "-"}</div>
              <div><strong>Strike:</strong> {selectedContract?.strikePrice} &bull; {selectedContract?.optionSide}</div>
              <div><strong>Expiration:</strong> {selectedContract ? formatDate(selectedContract.expirationDate) : "-"}</div>
              <div><strong>Order:</strong> {limit ? "Limit" : "Market"}</div>
              {limit && <div><strong>Limit Price:</strong> {formatMoney(limitPrice)} / share</div>}
            </>
          )}
          <div><strong>Quantity:</strong> {estimatedQuantity}</div>
          <div><strong>{orderAmountLabel}:</strong> {formatMoney(orderAmount)}</div>
          <div className="mt-2"><strong>Position Rules</strong></div>
          <div>
            <strong>Stop Loss:</strong>{" "}
            {currentRiskValues.stopLoss != null ? formatMoney(currentRiskValues.stopLoss) : "Not set"}
          </div>
          <div>
            <strong>Target:</strong>{" "}
            {currentRiskValues.target != null ? formatMoney(currentRiskValues.target) : "Not set"}
          </div>
          {instrumentType === "options" && (
            <>
              <div>
                <strong>Stop Loss (Underlying):</strong>{" "}
                {currentRiskValues.stopLossOnUnderlying != null
                  ? formatMoney(currentRiskValues.stopLossOnUnderlying)
                  : "Not set"}
              </div>
              <div>
                <strong>Target (Underlying):</strong>{" "}
                {currentRiskValues.targetOnUnderlying != null
                  ? formatMoney(currentRiskValues.targetOnUnderlying)
                  : "Not set"}
              </div>
            </>
          )}
        </div>
      ),
      acceptLabel: "Confirm Place Order",
      rejectLabel: "Cancel",
      accept: async () => {
        try {
          await submitOrder();
        } catch (err) {
          displayError(toast, err);
        }
      },
    });
  };

  return (
    <Card
      title="Make a Trade"
      className="trade-card"
      style={{ maxWidth: "700px", margin: "0 auto" }}
    >
      <div className="p-fluid">
        <div className="field">
          <label htmlFor="symbol">Symbol <span className="p-error">*</span></label>
          <InputText
            id="symbol"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="Stock Symbol"
            className="w-full"
          />
        </div>

        <div className="field">
          <label>Instrument Type <span className="p-error">*</span></label>
          <div className="trade-radio-group">
            <div className="trade-radio-option">
              <RadioButton
                inputId="instrument-stock"
                name="instrument"
                value="stock"
                checked={instrumentType === "stock"}
                onChange={() => handleInstrumentTypeChange("stock")}
              />
              <label htmlFor="instrument-stock">Stock</label>
            </div>
            <div className="trade-radio-option">
              <RadioButton
                inputId="instrument-options"
                name="instrument"
                value="options"
                checked={instrumentType === "options"}
                onChange={() => handleInstrumentTypeChange("options")}
              />
              <label htmlFor="instrument-options">Options</label>
            </div>
          </div>
        </div>

        {debouncedSymbolUpper && stockQuote?.description && (
          <div className="field">
            <div className="text-xl font-bold text-primary">{stockQuote.description}</div>
          </div>
        )}

        {instrumentType === "stock" && (
          <div className="field">
            <label>Stock Quote (updates every 5 seconds)</label>
            <div className="p-3 border-1 border-round surface-50">
              <div><strong>Bid:</strong> {formatMoney(stockQuote?.bid)}</div>
              <div><strong>Ask:</strong> {formatMoney(stockQuote?.ask)}</div>
              <div><strong>Mark:</strong> {formatMoney(stockQuote?.mark ?? stockQuote?.last)}</div>
            </div>
            {stockQuoteError && <small className="p-error block mt-2">{stockQuoteError}</small>}
          </div>
        )}

        {instrumentType === "options" && debouncedSymbolUpper && (
          <div className="field">
            <label>Underlying Stock Price</label>
            <div className="p-3 border-1 border-round surface-50">
              <div><strong>Bid:</strong> {formatMoney(stockQuote?.bid)}</div>
              <div><strong>Ask:</strong> {formatMoney(stockQuote?.ask)}</div>
              <div><strong>Mark:</strong> {formatMoney(stockQuote?.mark ?? stockQuote?.last)}</div>
            </div>
            {stockQuoteError && <small className="p-error block mt-2">{stockQuoteError}</small>}
          </div>
        )}

        {instrumentType === "stock" && (
          <div className="field">
            <label>Order Type</label>
            <div className="trade-radio-group">
              <div className="trade-radio-option">
                <RadioButton
                  inputId="stock-limit"
                  name="stock-order-type"
                  value="limit"
                  checked={limit}
                  onChange={() => setLimit(true)}
                />
                <label htmlFor="stock-limit">Limit Order</label>
              </div>
              <div className="trade-radio-option">
                <RadioButton
                  inputId="stock-market"
                  name="stock-order-type"
                  value="market"
                  checked={!limit}
                  onChange={() => setLimit(false)}
                />
                <label htmlFor="stock-market">Market Order</label>
              </div>
            </div>
            {limit && (
              <div className="mt-3">
                <InputNumber
                  placeholder="Limit Price"
                  value={limitPrice}
                  onValueChange={(e) => setLimitPrice(e.value ?? 0)}
                  minFractionDigits={2}
                  className="w-14rem"
                />
              </div>
            )}
          </div>
        )}

        {instrumentType === "options" && (
          <div className="quick-contract-lookup-box field">
            <div className="quick-contract-lookup-header">Quick Contract Lookup</div>
            <div className="field mb-2">
              <label>Strike</label>
              <div className="grid mt-1">
                {OPTION_AGGRESSIVENESS.map((option) => (
                  <div key={option.value} className="col-12 md:col-6 mb-2">
                    <div className="trade-radio-option">
                      <RadioButton
                        inputId={`aggressiveness-${option.value}`}
                        name="option-aggressiveness"
                        value={option.value}
                        checked={optionAggressiveness === option.value}
                        onChange={() => setOptionAggressiveness(option.value)}
                      />
                      <label htmlFor={`aggressiveness-${option.value}`}>{option.label}</label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="field mb-2">
              <label>Expiration Date</label>
              <div className="grid mt-1">
                {OPTION_LENGTHS.map((option) => (
                  <div key={option.value} className="col-12 md:col-6 mb-2">
                    <div className="trade-radio-option">
                      <RadioButton
                        inputId={`length-${option.value}`}
                        name="option-length"
                        value={option.value}
                        checked={optionLength === option.value}
                        onChange={() => setOptionLength(option.value)}
                      />
                      <label htmlFor={`length-${option.value}`}>{option.label}</label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {optionPreview && (
              <div className="quick-contract-suggestion">
                <div className="quick-contract-suggestion-title">Auto-suggested contract</div>
                <div><strong>Symbol:</strong> {optionPreview.contractSymbol}</div>
                <div><strong>Strike:</strong> {optionPreview.strikePrice} &bull; <strong>Expires:</strong> {formatDate(optionPreview.expirationDate)}</div>
                <div><strong>Bid:</strong> {formatMoney(optionPreview.bid)} &bull; <strong>Ask:</strong> {formatMoney(optionPreview.ask)}</div>
              </div>
            )}
            {optionPreviewError && <small className="p-error block mt-2">{optionPreviewError}</small>}
          </div>
        )}

        {instrumentType === "options" && (
          <div className="field">
            <div className="flex gap-2 mb-2 flex-wrap">
              <Button
                label="View Options Chain"
                icon="pi pi-list"
                outlined
                size="small"
                onClick={openOptionsChainDialog}
              />
              {selectedContractIsManual && optionPreview && (
                <Button
                  label="Use auto-suggested contract"
                  icon="pi pi-sync"
                  outlined
                  size="small"
                  severity="secondary"
                  onClick={() => {
                    setSelectedContract(previewToChainSelection(optionPreview));
                    setSelectedContractIsManual(false);
                  }}
                />
              )}
            </div>
            <label>Selected Contract <span className="p-error">*</span></label>
            {selectedContract ? (
              <div className="p-3 border-1 border-round surface-50">
                <div><strong>Contract:</strong> {selectedContract.symbol}</div>
                <div><strong>Type:</strong> {selectedContract.optionSide} &bull; <strong>Strike:</strong> {selectedContract.strikePrice}</div>
                <div><strong>Expiration:</strong> {formatDate(selectedContract.expirationDate)}</div>
                <div>
                  <strong>Bid:</strong> {formatMoney(optionQuote?.bid ?? selectedContract.bid)} &bull; <strong>Ask:</strong> {formatMoney(optionQuote?.ask ?? selectedContract.ask)}
                  {optionQuote && <span className="text-500 text-sm ml-2">(live)</span>}
                </div>
                {optionQuoteError && <small className="p-error block mt-1">{optionQuoteError}</small>}
              </div>
            ) : (
              <div className="p-3 border-1 border-round surface-50 text-color-secondary">No contract selected</div>
            )}
          </div>
        )}

        {instrumentType === "options" && (
          <div className="field">
            <label>Order Type</label>
            <div className="trade-radio-group">
              <div className="trade-radio-option">
                <RadioButton
                  inputId="options-limit"
                  name="options-order-type"
                  value="limit"
                  checked={limit}
                  onChange={() => setLimit(true)}
                />
                <label htmlFor="options-limit">Limit Order</label>
              </div>
              <div className="trade-radio-option">
                <RadioButton
                  inputId="options-market"
                  name="options-order-type"
                  value="market"
                  checked={!limit}
                  onChange={() => setLimit(false)}
                />
                <label htmlFor="options-market">Market Order</label>
              </div>
            </div>
            {limit && (
              <div className="mt-3">
                <InputNumber
                  placeholder="Limit Price (per share)"
                  value={limitPrice}
                  onValueChange={(e) => setLimitPrice(e.value ?? 0)}
                  minFractionDigits={2}
                  className="w-14rem"
                />
              </div>
            )}
          </div>
        )}

        <div className="field">
          <label htmlFor="quantity">Quantity <span className="p-error">*</span></label>
          <InputNumber
            id="quantity"
            value={quantity}
            onValueChange={(e) => setQuantity(e.value ?? null)}
            useGrouping={false}
            min={1}
            maxFractionDigits={0}
            className="w-full"
          />
        </div>

        <div className="field">
          <label>Position Stop Loss (Optional)</label>
          <InputNumber
            inputRef={stopLossInputRef}
            value={stopLoss}
            onValueChange={(e) => setStopLoss(e.value ?? undefined)}
            mode="currency"
            currency="USD"
            locale="en-US"
            placeholder="Exit if price drops below..."
            className="w-full"
          />
        </div>

        <div className="field">
          <label>Position Target (Optional)</label>
          <InputNumber
            inputRef={targetInputRef}
            value={target}
            onValueChange={(e) => setTarget(e.value ?? undefined)}
            mode="currency"
            currency="USD"
            locale="en-US"
            placeholder="Exit if price rises above..."
            className="w-full"
          />
        </div>

        {instrumentType === "options" && (
          <>
            <div className="field">
              <label>Stop Loss on Underlying (Optional)</label>
              <InputNumber
                inputRef={stopLossUnderlyingInputRef}
                value={stopLossOnUnderlying}
                onValueChange={(e) => setStopLossOnUnderlying(e.value ?? undefined)}
                mode="currency"
                currency="USD"
                locale="en-US"
                placeholder="Exit if underlying drops below..."
                className="w-full"
              />
            </div>

            <div className="field">
              <label>Target on Underlying (Optional)</label>
              <InputNumber
                inputRef={targetUnderlyingInputRef}
                value={targetOnUnderlying}
                onValueChange={(e) => setTargetOnUnderlying(e.value ?? undefined)}
                mode="currency"
                currency="USD"
                locale="en-US"
                placeholder="Exit if underlying rises above..."
                className="w-full"
              />
            </div>
          </>
        )}

        <div className="field">
          <div className="p-3 border-1 border-round surface-50">
            <div><strong>{orderAmountLabel}:</strong> {formatMoney(orderAmount)}</div>
          </div>
        </div>

        <Button
          label="Place Order"
          icon="pi pi-send"
          className="w-full p-4 text-lg"
          size="large"
          onClick={confirmPlaceOrder}
        />
      </div>

      <Dialog
        header={`Options Chain${symbolUpper ? ` - ${symbolUpper}` : ""}`}
        visible={optionsChainDialogVisible}
        onHide={() => setOptionsChainDialogVisible(false)}
        style={{ width: "80vw", maxWidth: "1000px" }}
        modal
        footer={(
          <div className="chain-modal-footer">
            {chainSelectionDraft && (
              <div className="chain-modal-footer-selection">
                <span className="font-semibold">{chainSelectionDraft.optionSide}</span>
                <span className="mx-2">{chainSelectionDraft.symbol}</span>
                <span className="mr-2">Strike {chainSelectionDraft.strikePrice}</span>
                <span className="mr-2">{formatDate(chainSelectionDraft.expirationDate)}</span>
                <span>{formatMoney(chainSelectionDraft.bid)} / {formatMoney(chainSelectionDraft.ask)}</span>
              </div>
            )}
            <div className="flex justify-content-end gap-2">
              <Button
                label="Cancel"
                severity="secondary"
                outlined
                onClick={() => setOptionsChainDialogVisible(false)}
              />
              <Button
                label="OK"
                icon="pi pi-check"
                onClick={confirmOptionsChainSelection}
              />
            </div>
          </div>
        )}
      >
        {optionsChainLoading && <div>Loading options chain...</div>}
        {!optionsChainLoading && optionsChainError && (
          <small className="p-error block">{optionsChainError}</small>
        )}

        {!optionsChainLoading && !optionsChainError && optionsChainData && (
          <>
            <Accordion multiple>
              {optionsChainData.expirations.map((expiration) => (
                <AccordionTab
                  key={expiration.expirationDate}
                  header={`${formatDate(expiration.expirationDate)} (${expiration.daysToExpiration} DTE)`}
                >
                  <div className="option-chain-section">
                    <div className="option-chain-section-title">Calls</div>
                    {expiration.calls.map((contract) => {
                      const isSelected = chainSelectionDraft?.symbol === contract.symbol;
                      return (
                        <div
                          key={contract.symbol}
                          className={`option-chain-row${isSelected ? " option-chain-row-selected" : ""}`}
                        >
                          <div>
                            <strong>{contract.strikePrice}</strong>  Bid {formatMoney(contract.bid)}  Ask {formatMoney(contract.ask)}
                          </div>
                          <Button
                            label={isSelected ? "Selected" : "Select"}
                            size="small"
                            onClick={() => setChainSelectionDraft({
                              ...contract,
                              expirationDate: expiration.expirationDate,
                              optionSide: "CALL",
                            })}
                          />
                        </div>
                      );
                    })}
                  </div>

                  <div className="option-chain-section mt-3">
                    <div className="option-chain-section-title">Puts</div>
                    {expiration.puts.map((contract) => {
                      const isSelected = chainSelectionDraft?.symbol === contract.symbol;
                      return (
                        <div
                          key={contract.symbol}
                          className={`option-chain-row${isSelected ? " option-chain-row-selected" : ""}`}
                        >
                          <div>
                            <strong>{contract.strikePrice}</strong>  Bid {formatMoney(contract.bid)}  Ask {formatMoney(contract.ask)}
                          </div>
                          <Button
                            label={isSelected ? "Selected" : "Select"}
                            size="small"
                            onClick={() => setChainSelectionDraft({
                              ...contract,
                              expirationDate: expiration.expirationDate,
                              optionSide: "PUT",
                            })}
                          />
                        </div>
                      );
                    })}
                  </div>
                </AccordionTab>
              ))}
            </Accordion>


          </>
        )}
      </Dialog>

      <Toast ref={toast} />
    </Card>
  );
};

export default TradeTab;
