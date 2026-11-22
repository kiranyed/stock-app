import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TabView, TabPanel } from "primereact/tabview";
import { Toast } from "primereact/toast";
import { ConfirmDialog, confirmDialog } from "primereact/confirmdialog";
import { Dropdown } from "primereact/dropdown";

import TradeTab from "./trade-tab";
import TransactionTab from "./transactions-tab";
import { PositionTable } from "./position-table";
import SelectedPositionsBar from "./selected-positions-bar";

import { IPosition } from "../shared/trading-types";
import { StockAppAPI } from "../shared/utilities/stock-app-api";
import { IDropDownItem } from "../shared/types";
import {
  validateSelectedPositions,
  generateOrders,
} from "./position-table-util";

import "./trading-page.scss";
import { IPriceQuotes } from "../shared/types";

export const orderOptions = [
  { label: "Buy", value: "BUY" },
  { label: "Sell", value: "SELL" },
  { label: "Short", value: "SELL_SHORT" },
  { label: "Buy to cover", value: "BUY_TO_COVER" },
];

const TradingPage: React.FC = () => {
  const toast = useRef<Toast>(null);

  const [positions, setPositions] = useState<IPosition[]>([]);
  const [selectedPositions, setSelectedPositions] = useState<IPosition[]>([]);
  const [orderType, setOrderType] = useState("");
  const [isMarket, setIsMarket] = useState(false);
  const [limitPercent, setLimitPercent] = useState("100");
  const [orderQuantityPercent, setOrderQuantityPercent] = useState("");
  const [quotes] = useState<IPriceQuotes>({});

  const accounts = useMemo<IDropDownItem[]>(
    () => [
      { label: "Trading", value: "trading" },
      { label: "Regular", value: "regular" },
    ],
    [],
  );
  const [selectedAccount, setSelectedAccount] = useState(
    () => accounts.find((account) => account.value === "regular") ?? accounts[1],
  );

  const refreshPositions = useCallback(async (accountValue = selectedAccount.value) => {
    const data = await StockAppAPI.getAccountPositions(accountValue);
    setPositions(data.positions || []);
  }, [selectedAccount.value]);

  /** 🔄 Fetch account positions */
  useEffect(() => {
    const fetchPositions = async () => {
      try {
        await refreshPositions(selectedAccount.value);
      } catch (err) {
        console.error("Error fetching positions:", err);
      }
    };

    fetchPositions();
  }, [refreshPositions, selectedAccount]);

  /** 🟢 Confirm + Submit orders */
  const accept = async () => {
    toast.current?.show({
      severity: "info",
      summary: "Confirmed",
      detail: "Order placed",
      life: 3000,
    });
    await submitAll();
  };

  const reject = () => {
    toast.current?.show({
      severity: "warn",
      summary: "Rejected",
      detail: "You have canceled the order",
      life: 3000,
    });
  };

  const confirmSubmit = () => {
    confirmDialog({
      message: "Are you sure you want to proceed?",
      header: "Confirmation",
      icon: "pi pi-exclamation-triangle",
      accept,
      reject,
    });
  };

  /** 🚀 Submit all orders */
  const submitAll = async () => {
    const error = validateSelectedPositions(
      selectedPositions,
      limitPercent,
      orderType,
      orderQuantityPercent,
    );
    if (error) {
      alert(error);
      return;
    }

    try {
      const orders = generateOrders(
        selectedPositions,
        orderType,
        true,
        parseFloat(limitPercent),
        parseFloat(orderQuantityPercent),
        quotes,
      );

      await StockAppAPI.makeOrders(orders, selectedAccount.value);

      await refreshPositions(selectedAccount.value);

      toast.current?.show({
        severity: "success",
        summary: "Success",
        detail: "Orders executed successfully",
        life: 3000,
      });
    } catch (err) {
      console.error("Order error:", err);
      toast.current?.show({
        severity: "error",
        summary: "Error",
        detail: "Failed to submit orders",
        life: 4000,
      });
    }
  };

  /** 🧹 Reset selected positions */
  const clearSelection = () => setSelectedPositions([]);

  /** 💰 Handle bulk order confirmation */
  const handleBulkOrder = () => {
    confirmSubmit();
  };

  return (
    <div className="trading-page">
      <div className="p-4 pb-0">
        <Dropdown
          value={selectedAccount.value}
          onChange={(e) => {
            const next = accounts.find((account) => account.value === e.value);
            if (next) {
              setSelectedAccount(next);
            }
          }}
          options={accounts}
          optionLabel="label"
          optionValue="value"
          placeholder="Select an account"
          className="w-full md:w-20rem"
        />
      </div>

      <TabView className="trading-tabs">
        <TabPanel header="Positions" leftIcon="pi pi-fw pi-chart-pie">
          <PositionTable
            positions={positions}
            selectedAccount={selectedAccount}
            selectedPositions={selectedPositions}
            setSelectedPositions={setSelectedPositions}
            refreshPositions={() => refreshPositions(selectedAccount.value)}
          />
        </TabPanel>

        <TabPanel header="Trade" leftIcon="pi pi-fw pi-dollar">
          <TradeTab accountType={selectedAccount.value} />
        </TabPanel>

        <TabPanel header="History" leftIcon="pi pi-fw pi-history">
          <TransactionTab accountType={selectedAccount.value} />
        </TabPanel>
      </TabView>

      <Toast ref={toast} />
      <ConfirmDialog />

      {/* 📉 Bottom Floating Action Bar */}
      {selectedPositions.length > 0 && (
        <SelectedPositionsBar
          setIsMarket={setIsMarket}
          setLimitPercent={setLimitPercent}
          setOrderQuantityPercent={setOrderQuantityPercent}
          setOrderType={setOrderType}
          orderType={orderType}
          isMarket={isMarket}
          limitPercent={limitPercent}
          orderQuantityPercent={orderQuantityPercent}
          positions={selectedPositions}
          onSubmit={handleBulkOrder}
          onClear={clearSelection}
        />
      )}
    </div>
  );
};

export default TradingPage;
