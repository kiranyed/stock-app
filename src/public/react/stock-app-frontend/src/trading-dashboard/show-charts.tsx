import React from "react";
import { Chart } from "primereact/chart";
import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import { Checkbox, CheckboxChangeEvent } from "primereact/checkbox";
import { Calendar } from "primereact/calendar";
import {
  AutoComplete,
  AutoCompleteChangeEvent,
  AutoCompleteCompleteEvent,
} from "primereact/autocomplete";
import { RadioButton, RadioButtonChangeEvent } from "primereact/radiobutton";
import { FormEvent } from "primereact/ts-helpers";
import { ChartOptions, ScriptableLineSegmentContext } from "chart.js";
import { StockAppAPI } from "../shared/utilities/stock-app-api";
import {
  ChartStockItem,
  IChartStockData,
  IGain,
  IStockNameData,
  NameIdPair,
} from "../shared/types";

interface IProps {
  placeholder?: "";
}

type TimeRangeKey = "1D" | "1W" | "1M" | "3M" | "6M" | "1Y" | "5Y" | "10Y" | "ALL";

const TIME_RANGE_LABELS: TimeRangeKey[] = ["1D", "1W", "1M", "3M", "6M", "1Y", "5Y", "10Y", "ALL"];
const DEFAULT_TIME_RANGE: TimeRangeKey = "1Y";

const getResolution = (rangeKey: TimeRangeKey, historyDays?: number): { frequencyMinutes: number; showTimeInTooltip: boolean } => {
  switch (rangeKey) {
    case "1D": return { frequencyMinutes: 5, showTimeInTooltip: true };
    case "1W": return { frequencyMinutes: 30, showTimeInTooltip: true };
    case "1M":
    case "3M":
    case "6M":
    case "1Y":
      return { frequencyMinutes: 1440, showTimeInTooltip: false };
    case "5Y": return { frequencyMinutes: 10080, showTimeInTooltip: false };
    case "10Y": return { frequencyMinutes: 20160, showTimeInTooltip: false };
    case "ALL": {
      const days = historyDays ?? 365;
      if (days < 365) return { frequencyMinutes: 1440, showTimeInTooltip: false };
      if (days < 1825) return { frequencyMinutes: 10080, showTimeInTooltip: false };
      if (days < 7300) return { frequencyMinutes: 43200, showTimeInTooltip: false };
      return { frequencyMinutes: 129600, showTimeInTooltip: false };
    }
  }
};

const getRangeStartDate = (rangeKey: TimeRangeKey): Date => {
  const now = new Date();
  switch (rangeKey) {
    case "1D": { const d = new Date(now); d.setDate(d.getDate() - 1); return d; }
    case "1W": { const d = new Date(now); d.setDate(d.getDate() - 7); return d; }
    case "1M": { const d = new Date(now); d.setMonth(d.getMonth() - 1); return d; }
    case "3M": { const d = new Date(now); d.setMonth(d.getMonth() - 3); return d; }
    case "6M": { const d = new Date(now); d.setMonth(d.getMonth() - 6); return d; }
    case "1Y": { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return d; }
    case "5Y": { const d = new Date(now); d.setFullYear(d.getFullYear() - 5); return d; }
    case "10Y": { const d = new Date(now); d.setFullYear(d.getFullYear() - 10); return d; }
    case "ALL": return new Date(0);
  }
};

interface IState {
  stockDataList: IStockData[];
  stockSymbol: string;
  input: string;
  fromDate: Date;
  toDate: Date;
  displayType: string;
  sigVal: string;
  showSpecificRange: boolean;
  chartTimeRanges: Record<number, TimeRangeKey>;
  inputMode: "symbols" | "group";
  selectedGroup: NameIdPair;
  allGroups: NameIdPair[];
  filteredGroups: NameIdPair[];
  dragSelections: Record<number, IDragSelection>;
  hoveredChartIdx: number | null;
  activeDragChartIdx: number | null;
}

interface IPoint {
  x: number;
  y: number;
  datetime?: number;
}

interface IDataset {
  label: string;
  data: IPoint[];
  fill: boolean;
  backgroundColor: string | ((ctx: unknown) => string);
  borderColor: string | ((ctx: unknown) => string);
  segment?: {
    borderColor?: (ctx: ScriptableLineSegmentContext) => string;
    borderWidth?: (ctx: ScriptableLineSegmentContext) => number;
  };
}
interface IStockData {
  labels: string[];
  datasets: IDataset[];
}

interface IPointData {
  index: number;
  x: number;
  y: number;
  datetime?: number;
}

interface IDragSelection {
  start: IPointData;
  current: IPointData;
}

interface IChartJsLike {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  chartArea?: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  scales?: {
    x?: {
      getValueForPixel: (pixel: number) => number;
      getPixelForValue: (value: number) => number;
    };
    y?: {
      getPixelForValue: (value: number) => number;
    };
  };
}

interface IChartStyleCacheEntry {
  sourceData: IStockData;
  selectionSignature: string;
  isHoverActive: boolean;
  chartData: IStockData;
}

type IPrimeChartRef = Chart & {
  getChart?: () => unknown;
  chart?: unknown;
};

export class ShowCharts extends React.Component<IProps, IState> {
  private chartRefs: Record<number, Chart | null> = {};

  private chartContainerRefs: Record<number, HTMLDivElement | null> = {};

  private liveDragSelections: Record<number, IDragSelection | undefined> = {};

  private dragLineStartRefs: Record<number, HTMLDivElement | null> = {};

  private dragLineEndRefs: Record<number, HTMLDivElement | null> = {};

  private dragCircleStartRefs: Record<number, HTMLDivElement | null> = {};

  private dragCircleEndRefs: Record<number, HTMLDivElement | null> = {};

  private dragDimLeftRefs: Record<number, HTMLDivElement | null> = {};

  private dragDimRightRefs: Record<number, HTMLDivElement | null> = {};

  private dragSelectionFillRefs: Record<number, HTMLDivElement | null> = {};

  private dragPercentLabelRefs: Record<number, HTMLDivElement | null> = {};

  private dragDollarLabelRefs: Record<number, HTMLDivElement | null> = {};

  private hoverLineRefs: Record<number, HTMLDivElement | null> = {};

  private hoverCircleRefs: Record<number, HTMLDivElement | null> = {};

  private hoverInfoRefs: Record<number, HTMLDivElement | null> = {};

  private chartStyleCache: Record<number, IChartStyleCacheEntry | undefined> = {};

  private dragRafId: number | null = null;

  private pendingDragPointer: { clientX: number } | null = null;

  private readonly compactCurrencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  private readonly currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  private readonly dayFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/New_York",
  });

  private readonly minuteFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/New_York",
  });

  private readonly dayTooltipFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  });

  private readonly minuteTooltipFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/New_York",
  });

  state: IState = {
    input: "AAPL",
    stockSymbol: "",
    stockDataList: new Array<IStockData>(),
    fromDate: new Date("January 1, 2026"),
    toDate: new Date("May 17, 2026"),
    displayType: "",
    sigVal: ".0028",
    showSpecificRange: false,
    chartTimeRanges: {},
    inputMode: "symbols",
    selectedGroup: { name: "", id: 0 },
    allGroups: [],
    filteredGroups: [],
    dragSelections: {},
    hoveredChartIdx: null,
    activeDragChartIdx: null,
  };

  componentDidMount() {
    document.addEventListener("mousedown", this.handleDocumentMouseDown);
    StockAppAPI.getAllStockGroupNames()
      .then((groups: NameIdPair[]) => {
        this.setState({ allGroups: groups });
      })
      .catch((err) => {
        console.log(err);
      });
  }

  componentWillUnmount() {
    document.removeEventListener("mousedown", this.handleDocumentMouseDown);
    this.removeWindowListeners();
    if (this.dragRafId !== null) {
      window.cancelAnimationFrame(this.dragRafId);
      this.dragRafId = null;
    }
  }

  handleDocumentMouseDown = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }

    const clickedInsideChart = Object.values(this.chartContainerRefs).some(
      (container) => !!container && container.contains(target),
    );
    if (clickedInsideChart) {
      return;
    }

    if (
      Object.keys(this.state.dragSelections).length > 0 ||
      this.state.activeDragChartIdx !== null
    ) {
      Object.keys(this.dragLineStartRefs).forEach((key) => {
        this.hideDragPreview(Number(key));
      });
      this.liveDragSelections = {};
      this.setState({
        dragSelections: {},
        activeDragChartIdx: null,
      });
    }
  };

  setChartRef = (idx: number) => (chart: Chart | null) => {
    this.chartRefs[idx] = chart;
  };

  setChartContainerRef = (idx: number) => (container: HTMLDivElement | null) => {
    this.chartContainerRefs[idx] = container;
  };

  setDragLineStartRef = (idx: number) => (element: HTMLDivElement | null) => {
    this.dragLineStartRefs[idx] = element;
  };

  setDragLineEndRef = (idx: number) => (element: HTMLDivElement | null) => {
    this.dragLineEndRefs[idx] = element;
  };

  setDragCircleStartRef = (idx: number) => (element: HTMLDivElement | null) => {
    this.dragCircleStartRefs[idx] = element;
  };

  setDragCircleEndRef = (idx: number) => (element: HTMLDivElement | null) => {
    this.dragCircleEndRefs[idx] = element;
  };

  setDragDimLeftRef = (idx: number) => (element: HTMLDivElement | null) => {
    this.dragDimLeftRefs[idx] = element;
  };

  setDragDimRightRef = (idx: number) => (element: HTMLDivElement | null) => {
    this.dragDimRightRefs[idx] = element;
  };

  setDragSelectionFillRef = (idx: number) => (element: HTMLDivElement | null) => {
    this.dragSelectionFillRefs[idx] = element;
  };

  setDragPercentLabelRef = (idx: number) => (element: HTMLDivElement | null) => {
    this.dragPercentLabelRefs[idx] = element;
  };

  setDragDollarLabelRef = (idx: number) => (element: HTMLDivElement | null) => {
    this.dragDollarLabelRefs[idx] = element;
  };

  setHoverLineRef = (idx: number) => (element: HTMLDivElement | null) => {
    this.hoverLineRefs[idx] = element;
  };

  setHoverCircleRef = (idx: number) => (element: HTMLDivElement | null) => {
    this.hoverCircleRefs[idx] = element;
  };

  setHoverInfoRef = (idx: number) => (element: HTMLDivElement | null) => {
    this.hoverInfoRefs[idx] = element;
  };

  addWindowListeners = () => {
    window.addEventListener("mousemove", this.handleWindowMouseMove);
    window.addEventListener("mouseup", this.handleWindowMouseUp);
  };

  removeWindowListeners = () => {
    window.removeEventListener("mousemove", this.handleWindowMouseMove);
    window.removeEventListener("mouseup", this.handleWindowMouseUp);
  };

  handleWindowMouseMove = (event: MouseEvent) => {
    const { activeDragChartIdx } = this.state;
    if (activeDragChartIdx === null) {
      return;
    }
    this.pendingDragPointer = { clientX: event.clientX };
    if (this.dragRafId !== null) {
      return;
    }
    this.dragRafId = window.requestAnimationFrame(() => {
      this.dragRafId = null;
      const activeIdx = this.state.activeDragChartIdx;
      const pointer = this.pendingDragPointer;
      this.pendingDragPointer = null;
      if (activeIdx === null || !pointer) {
        return;
      }
      this.updateSelectionForPointer(activeIdx, pointer);
    });
  };

  handleChartMouseMove = (chartIdx: number) => (event: React.MouseEvent) => {
    const point = this.getNearestPoint(chartIdx, event.nativeEvent);
    if (!point) {
      return;
    }

    this.updateHoverOverlay(chartIdx, point);

    if (this.state.activeDragChartIdx === chartIdx) {
      this.updateSelectionForPointer(chartIdx, {
        clientX: event.nativeEvent.clientX,
      });
    }
  };

  handleChartMouseEnter = (chartIdx: number) => () => {
    if (this.state.hoveredChartIdx !== chartIdx) {
      this.setState({ hoveredChartIdx: chartIdx });
    }
  };

  handleChartMouseLeave = (chartIdx: number) => () => {
    this.hideHoverOverlay(chartIdx);
    if (this.state.activeDragChartIdx !== chartIdx) {
      this.hideDragPreview(chartIdx);
    }
    if (this.state.hoveredChartIdx === chartIdx) {
      this.setState({ hoveredChartIdx: null });
    }
  };

  hideHoverOverlay = (chartIdx: number) => {
    const line = this.hoverLineRefs[chartIdx];
    const circle = this.hoverCircleRefs[chartIdx];
    const info = this.hoverInfoRefs[chartIdx];
    if (line) {
      line.style.display = "none";
    }
    if (circle) {
      circle.style.display = "none";
    }
    if (info) {
      info.style.display = "none";
    }
  };

  hideDragPreview = (chartIdx: number) => {
    const elements = [
      this.dragLineStartRefs[chartIdx],
      this.dragLineEndRefs[chartIdx],
      this.dragCircleStartRefs[chartIdx],
      this.dragCircleEndRefs[chartIdx],
      this.dragDimLeftRefs[chartIdx],
      this.dragDimRightRefs[chartIdx],
      this.dragSelectionFillRefs[chartIdx],
      this.dragPercentLabelRefs[chartIdx],
      this.dragDollarLabelRefs[chartIdx],
    ];
    elements.forEach((element) => {
      if (element) {
        element.style.display = "none";
      }
    });
  };

  updateDragPreview = (chartIdx: number, selection: IDragSelection) => {
    const chartJs = this.getChartInstance(chartIdx);
    const chartArea = chartJs?.chartArea;
    const xScale = chartJs?.scales?.x;
    const yScale = chartJs?.scales?.y;
    if (!chartArea || !xScale || !yScale) {
      return;
    }

    const { leftPoint, rightPoint } = this.getNormalizedRange(selection);
    const stats = this.getRangeStats(leftPoint, rightPoint);

    const startX = xScale.getPixelForValue(leftPoint.x);
    const endX = xScale.getPixelForValue(rightPoint.x);
    const leftX = Math.min(startX, endX);
    const rightX = Math.max(startX, endX);
    const startY = yScale.getPixelForValue(leftPoint.y);
    const endY = yScale.getPixelForValue(rightPoint.y);
    const lineHeight = chartArea.bottom - chartArea.top;
    const midX = (startX + endX) / 2;
    const topY = chartArea.top - 22;

    const setDisplay = (element: HTMLDivElement | null, styles: Record<string, string>) => {
      if (!element) {
        return;
      }
      element.style.display = "block";
      Object.entries(styles).forEach(([key, value]) => {
        (element.style as unknown as Record<string, string>)[key] = value;
      });
    };

    setDisplay(this.dragDimLeftRefs[chartIdx], {
      left: `${chartArea.left}px`,
      top: `${chartArea.top}px`,
      width: `${Math.max(0, leftX - chartArea.left + 1)}px`,
      height: `${lineHeight}px`,
      background: "rgba(255, 255, 255, 0.55)",
      position: "absolute",
    });

    setDisplay(this.dragDimRightRefs[chartIdx], {
      left: `${rightX}px`,
      top: `${chartArea.top}px`,
      width: `${Math.max(0, chartArea.right - rightX)}px`,
      height: `${lineHeight}px`,
      background: "rgba(255, 255, 255, 0.55)",
      position: "absolute",
    });

    setDisplay(this.dragSelectionFillRefs[chartIdx], {
      left: `${leftX}px`,
      top: `${chartArea.top}px`,
      width: `${Math.max(0, rightX - leftX)}px`,
      height: `${lineHeight}px`,
      background: this.withOpacity(stats.color, 0.25),
      position: "absolute",
    });

    setDisplay(this.dragLineStartRefs[chartIdx], {
      left: `${startX}px`,
      top: `${chartArea.top}px`,
      height: `${lineHeight}px`,
      background: stats.color,
      opacity: "1",
      transform: "translateX(-1px)",
      width: "2px",
      position: "absolute",
    });

    setDisplay(this.dragLineEndRefs[chartIdx], {
      left: `${endX}px`,
      top: `${chartArea.top}px`,
      height: `${lineHeight}px`,
      background: stats.color,
      opacity: "1",
      transform: "translateX(-1px)",
      width: "2px",
      position: "absolute",
    });

    setDisplay(this.dragCircleStartRefs[chartIdx], {
      left: `${startX}px`,
      top: `${startY}px`,
      border: `2px solid ${stats.color}`,
      transform: "translate(-50%, -50%)",
      width: "10px",
      height: "10px",
      borderRadius: "50%",
      background: "#ffffff",
      boxSizing: "border-box",
      position: "absolute",
    });

    setDisplay(this.dragCircleEndRefs[chartIdx], {
      left: `${endX}px`,
      top: `${endY}px`,
      border: `2px solid ${stats.color}`,
      transform: "translate(-50%, -50%)",
      width: "10px",
      height: "10px",
      borderRadius: "50%",
      background: "#ffffff",
      boxSizing: "border-box",
      position: "absolute",
    });

    const percentLabel = this.dragPercentLabelRefs[chartIdx];
    if (percentLabel) {
      percentLabel.style.display = "block";
      percentLabel.style.left = `${midX}px`;
      percentLabel.style.top = `${topY}px`;
      percentLabel.style.color = stats.color;
      percentLabel.textContent = `${stats.sign}${stats.percentChange.toFixed(2)}%`;
    }

    const dollarLabel = this.dragDollarLabelRefs[chartIdx];
    if (dollarLabel) {
      dollarLabel.style.display = "block";
      dollarLabel.style.left = `${midX - 80}px`;
      dollarLabel.style.top = `${topY}px`;
      dollarLabel.style.color = stats.color;
      dollarLabel.textContent = `${stats.sign}${this.formatPrice(stats.absoluteChange)}`;
    }
  };

  updateHoverOverlay = (chartIdx: number, point: IPointData) => {
    const chartJs = this.getChartInstance(chartIdx);
    const chartArea = chartJs?.chartArea;
    const xScale = chartJs?.scales?.x;
    const yScale = chartJs?.scales?.y;
    const line = this.hoverLineRefs[chartIdx];
    const circle = this.hoverCircleRefs[chartIdx];
    const info = this.hoverInfoRefs[chartIdx];

    if (!chartArea || !xScale || !yScale || !line || !circle || !info) {
      return;
    }

    const x = xScale.getPixelForValue(point.x);
    const y = yScale.getPixelForValue(point.y);
    const lineHeight = chartArea.bottom - chartArea.top;

    line.style.display = "block";
    line.style.left = `${x}px`;
    line.style.top = `${chartArea.top}px`;
    line.style.height = `${lineHeight}px`;

    // Apply trend color if actively dragging on this chart
    const selection = this.liveDragSelections[chartIdx];
    if (selection && selection.start.index !== point.index) {
      const color = this.getTrendColor(selection.start.y, point.y);
      line.style.background = color;
    } else {
      line.style.background = "#2563eb";
    }

    circle.style.display = "block";
    circle.style.left = `${x}px`;
    circle.style.top = `${y}px`;

    info.style.display = "block";
    info.style.left = `${x}px`;
    info.textContent = `${this.formatXAxisLabel(point.x, chartIdx, undefined, true)} | Price: ${this.formatPrice(point.y)}`;
  };

  handleWindowMouseUp = () => {
    const activeIdx = this.state.activeDragChartIdx;
    if (activeIdx !== null) {
      const finalSelection = this.liveDragSelections[activeIdx];
      const isRealSelection = finalSelection && finalSelection.start.index !== finalSelection.current.index;
      this.setState((prev) => {
        const next = { ...prev.dragSelections };
        if (isRealSelection) {
          next[activeIdx] = finalSelection;
        } else {
          delete next[activeIdx];
        }
        return { activeDragChartIdx: null, dragSelections: next };
      });
      this.hideDragPreview(activeIdx);
      delete this.liveDragSelections[activeIdx];
    }
    this.pendingDragPointer = null;
    if (this.dragRafId !== null) {
      window.cancelAnimationFrame(this.dragRafId);
      this.dragRafId = null;
    }
    this.removeWindowListeners();
  };

  searchGroups = (event: AutoCompleteCompleteEvent) => {
    const query = event.query.toLowerCase();
    const filtered = this.state.allGroups.filter((group) =>
      group.name.toLowerCase().includes(query),
    );
    this.setState({ filteredGroups: filtered });
  };

  changeGroupName = (event: AutoCompleteChangeEvent) => {
    const value = event.target.value;
    if (typeof value === "string") {
      this.setState({ selectedGroup: { name: value, id: 0 } });
      return;
    }
    this.setState({ selectedGroup: value as NameIdPair });
  };

  selectInputMode = (event: RadioButtonChangeEvent) => {
    const inputMode = event.value as "symbols" | "group";
    this.setState({ inputMode });
  };

  getChartOptions = (chartIdx: number): ChartOptions<"line"> => {
    return {
      animation: false,
      normalized: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "nearest",
        intersect: false,
      },
      elements: {
        point: {
          radius: 0,
          hoverRadius: 3,
        },
      },
      scales: {
        x: {
          type: "linear",
          ticks: {
            autoSkip: true,
            maxTicksLimit: 8,
            callback: (tickValue) => this.formatXAxisLabel(tickValue, chartIdx),
          },
        },
        y: {
          ticks: {
            callback: (tickValue) => this.formatCompactPrice(tickValue),
          },
        },
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          enabled: false,
        },
      },
    };
  };

  formatPrice = (value: number) => {
    return this.currencyFormatter.format(value);
  };

  withOpacity = (hex: string, alpha: number) => {
    const normalized = hex.replace("#", "");
    if (normalized.length !== 6) {
      return hex;
    }
    const r = Number.parseInt(normalized.slice(0, 2), 16);
    const g = Number.parseInt(normalized.slice(2, 4), 16);
    const b = Number.parseInt(normalized.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  getTrendColor = (start: number, end: number) => {
    if (end > start) {
      return "#16a34a";
    }
    if (end < start) {
      return "#dc2626";
    }
    return "#374151";
  };

  formatCompactPrice = (value: number | string) => {
    const numeric = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numeric)) {
      return "";
    }
    return this.compactCurrencyFormatter.format(numeric);
  };

  getTimeRangeForChart = (chartIdx: number): TimeRangeKey => {
    return this.state.chartTimeRanges[chartIdx] ?? DEFAULT_TIME_RANGE;
  };

  getPointForXValue = (chartIdx: number, rawValue: number) => {
    const points = this.state.stockDataList[chartIdx]?.datasets?.[0]?.data ?? [];
    if (points.length === 0) {
      return null;
    }

    let left = 0;
    let right = points.length - 1;
    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      if (points[mid].x < rawValue) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    const candidate = left;
    const previous = Math.max(0, candidate - 1);
    return Math.abs(points[candidate].x - rawValue) < Math.abs(points[previous].x - rawValue)
      ? points[candidate]
      : points[previous];
  };

  formatPointDate = (
    point: Pick<IPoint, "datetime"> | null | undefined,
    chartIdx: number,
    overrideShowTime?: boolean,
    includeYear = false,
  ) => {
    if (!point?.datetime) {
      return "";
    }

    const chartRange = this.getTimeRangeForChart(chartIdx);
    const { showTimeInTooltip } = getResolution(chartRange);
    const includeTime = overrideShowTime ?? showTimeInTooltip;
    const displayDate = new Date(point.datetime);

    if (includeTime) {
      return includeYear
        ? this.minuteTooltipFormatter.format(displayDate)
        : this.minuteFormatter.format(displayDate);
    }

    return includeYear
      ? this.dayTooltipFormatter.format(displayDate)
      : this.dayFormatter.format(displayDate);
  };

  formatXAxisLabel = (
    rawValue: number | string,
    chartIdx: number,
    overrideShowTime?: boolean,
    includeYear = false,
  ) => {
    const value = typeof rawValue === "number" ? rawValue : Number(rawValue);
    if (!Number.isFinite(value)) {
      return "";
    }

    const point = this.getPointForXValue(chartIdx, value);
    if (point?.datetime) {
      return this.formatPointDate(
        point,
        chartIdx,
        overrideShowTime,
        includeYear,
      );
    }

    return "";
  };

  getChartInstance = (chartIdx: number) => {
    const chartComponent = this.chartRefs[chartIdx] as IPrimeChartRef | null;
    return (chartComponent?.getChart?.() ??
      chartComponent?.chart) as IChartJsLike | undefined;
  };

  getNearestPoint = (chartIdx: number, pointer: { clientX: number }) => {
    const points = this.state.stockDataList[chartIdx]?.datasets?.[0]?.data ?? [];
    if (points.length === 0) {
      return null;
    }

    const chartJs = this.getChartInstance(chartIdx);
    const container = this.chartContainerRefs[chartIdx];

    const rect = chartJs?.canvas?.getBoundingClientRect() ?? container?.getBoundingClientRect();
    if (!rect || pointer.clientX < rect.left || pointer.clientX > rect.right) {
      return null;
    }

    let xValue: number;
    const xScale = chartJs?.scales?.x;
    if (xScale) {
      xValue = xScale.getValueForPixel(pointer.clientX - rect.left);
      if (!Number.isFinite(xValue)) {
        return null;
      }
    } else {
      const relativeX = (pointer.clientX - rect.left) / Math.max(rect.width, 1);
      const clamped = Math.min(1, Math.max(0, relativeX));
      xValue = clamped * (points.length - 1);
    }

    let left = 0;
    let right = points.length - 1;
    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      if (points[mid].x < xValue) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    const candidate = left;
    const previous = Math.max(0, candidate - 1);
    const bestIndex =
      Math.abs(points[candidate].x - xValue) < Math.abs(points[previous].x - xValue)
        ? candidate
        : previous;
    const point = points[bestIndex];

    return {
      index: bestIndex,
      x: point.x,
      y: point.y,
      datetime: point.datetime,
    } as IPointData;
  };

  getNormalizedRange = (selection: IDragSelection) => {
    const leftPoint =
      selection.start.x <= selection.current.x ? selection.start : selection.current;
    const rightPoint =
      selection.start.x <= selection.current.x ? selection.current : selection.start;
    return { leftPoint, rightPoint };
  };

  getRangeStats = (leftPoint: IPointData, rightPoint: IPointData) => {
    const absoluteChange = rightPoint.y - leftPoint.y;
    const percentChange = rightPoint.y === 0 ? 0 : (absoluteChange / leftPoint.y) * 100;
    const color = absoluteChange > 0 ? "#0b7a22" : absoluteChange < 0 ? "#b42318" : "#1f2937";
    const sign = absoluteChange > 0 ? "+" : "";
    return { absoluteChange, percentChange, color, sign };
  };

  getSelectionMetrics = (chartIdx: number) => {
    const selection = this.state.dragSelections[chartIdx];
    if (!selection) {
      return null;
    }

    const { leftPoint, rightPoint } = this.getNormalizedRange(selection);
    const { absoluteChange, percentChange, color, sign } = this.getRangeStats(
      leftPoint,
      rightPoint,
    );
    const dateRange = `${this.formatPointDate(leftPoint, chartIdx, undefined, true)} - ${this.formatPointDate(rightPoint, chartIdx, undefined, true)}`;

    return {
      selection,
      leftPoint,
      rightPoint,
      absoluteChange,
      percentChange,
      color,
      sign,
      dateRange,
    };
  };

  renderSelectionHeader = (chartIdx: number) => {
    const metrics = this.getSelectionMetrics(chartIdx);
    if (!metrics) {
      return (
        <div style={{ marginBottom: "0.5rem", color: "#6b7280", fontSize: "0.9rem" }}>
          Click and drag on the chart to see date range and change details.
        </div>
      );
    }

    return (
      <div
        style={{
          marginBottom: "0.5rem",
          color: "#374151",
          fontSize: "0.9rem",
          fontWeight: 500,
        }}
      >
        {metrics.dateRange}
      </div>
    );
  };

  renderSelectionValueOverlay = (chartIdx: number) => {
    if (this.state.activeDragChartIdx === chartIdx) {
      return null;
    }
    const metrics = this.getSelectionMetrics(chartIdx);
    if (!metrics) {
      return null;
    }

    const chartJs = this.getChartInstance(chartIdx);
    const chartArea = chartJs?.chartArea;
    const xScale = chartJs?.scales?.x;
    if (!chartArea || !xScale) {
      return null;
    }

    const startX = xScale.getPixelForValue(metrics.leftPoint.x);
    const endX = xScale.getPixelForValue(metrics.rightPoint.x);
    const midX = (startX + endX) / 2;
    const topY = chartArea.top - 22;

    return (
      <>
        <div
          style={{
            position: "absolute",
            left: `${midX}px`,
            top: `${topY}px`,
            transform: "translateX(-50%)",
            color: metrics.color,
            fontWeight: 700,
            fontSize: "1rem",
            whiteSpace: "nowrap",
          }}
        >
          {`${metrics.sign}${metrics.percentChange.toFixed(2)}%`}
        </div>
        <div
          style={{
            position: "absolute",
            left: `${midX - 80}px`,
            top: `${topY}px`,
            transform: "translateX(-100%)",
            color: metrics.color,
            fontWeight: 700,
            fontSize: "1rem",
            whiteSpace: "nowrap",
          }}
        >
          {`${metrics.sign}${this.formatPrice(metrics.absoluteChange)}`}
        </div>
      </>
    );
  };

  renderSelectionOverlay = (chartIdx: number) => {
    if (this.state.activeDragChartIdx === chartIdx) {
      return null;
    }
    const metrics = this.getSelectionMetrics(chartIdx);
    if (!metrics) {
      return null;
    }

    const chartJs = this.getChartInstance(chartIdx);
    const chartArea = chartJs?.chartArea;
    const xScale = chartJs?.scales?.x;
    const yScale = chartJs?.scales?.y;
    if (!chartArea || !xScale || !yScale) {
      return null;
    }

    const startX = xScale.getPixelForValue(metrics.leftPoint.x);
    const endX = xScale.getPixelForValue(metrics.rightPoint.x);
    const leftX = Math.min(startX, endX);
    const rightX = Math.max(startX, endX);
    const startY = yScale.getPixelForValue(metrics.leftPoint.y);
    const endY = yScale.getPixelForValue(metrics.rightPoint.y);
    const lineHeight = chartArea.bottom - chartArea.top;
    const markerColor = metrics.color;

    return (
      <>
        <div
          style={{
            position: "absolute",
            left: `${chartArea.left}px`,
            top: `${chartArea.top}px`,
            width: `${Math.max(0, leftX - chartArea.left)}px`,
            height: `${lineHeight}px`,
            background: "rgba(255, 255, 255, 0.55)",
          }}
        ></div>
        <div
          style={{
            position: "absolute",
            left: `${rightX}px`,
            top: `${chartArea.top}px`,
            width: `${Math.max(0, chartArea.right - rightX)}px`,
            height: `${lineHeight}px`,
            background: "rgba(255, 255, 255, 0.55)",
          }}
        ></div>
        <div
          style={{
            position: "absolute",
            left: `${leftX}px`,
            top: `${chartArea.top}px`,
            width: `${Math.max(0, rightX - leftX)}px`,
            height: `${lineHeight}px`,
            background: this.withOpacity(markerColor, 0.25),
          }}
        ></div>
        <div
          style={{
            position: "absolute",
            left: `${startX}px`,
            top: `${chartArea.top}px`,
            width: "2px",
            height: `${lineHeight}px`,
            background: markerColor,
            transform: "translateX(-1px)",
          }}
        ></div>
        <div
          style={{
            position: "absolute",
            left: `${endX}px`,
            top: `${chartArea.top}px`,
            width: "2px",
            height: `${lineHeight}px`,
            background: markerColor,
            transform: "translateX(-1px)",
          }}
        ></div>
        <div
          style={{
            position: "absolute",
            left: `${startX}px`,
            top: `${startY}px`,
            width: "10px",
            height: "10px",
            borderRadius: "50%",
            border: `2px solid ${markerColor}`,
            background: "#ffffff",
            transform: "translate(-50%, -50%)",
            boxSizing: "border-box",
          }}
        ></div>
        <div
          style={{
            position: "absolute",
            left: `${endX}px`,
            top: `${endY}px`,
            width: "10px",
            height: "10px",
            borderRadius: "50%",
            border: `2px solid ${markerColor}`,
            background: "#ffffff",
            transform: "translate(-50%, -50%)",
            boxSizing: "border-box",
          }}
        ></div>
      </>
    );
  };

  updateSelectionForPointer = (chartIdx: number, pointer: { clientX: number }) => {
    const point = this.getNearestPoint(chartIdx, pointer);
    if (!point) {
      return;
    }

    const currentSelection = this.liveDragSelections[chartIdx] ?? this.state.dragSelections[chartIdx];
    if (!currentSelection) {
      return;
    }
    if (currentSelection.current.index === point.index) {
      return;
    }

    const nextSelection: IDragSelection = {
      ...currentSelection,
      current: point,
    };
    this.liveDragSelections[chartIdx] = nextSelection;
    this.updateDragPreview(chartIdx, nextSelection);
    this.forceUpdate();
  };

  handleChartMouseDown = (chartIdx: number) => (event: React.MouseEvent) => {
    const point = this.getNearestPoint(chartIdx, { clientX: event.nativeEvent.clientX });
    if (!point) {
      return;
    }

    const selection: IDragSelection = {
      start: point,
      current: point,
    };
    this.liveDragSelections[chartIdx] = selection;
    this.hideHoverOverlay(chartIdx);
    this.setState({ activeDragChartIdx: chartIdx });
    this.hideDragPreview(chartIdx);
    this.addWindowListeners();
  };

  getSelectionSignature = (selection?: IDragSelection) => {
    if (!selection) {
      return "none";
    }
    const { leftPoint, rightPoint } = this.getNormalizedRange(selection);
    return `${leftPoint.index}:${rightPoint.index}:${leftPoint.y}:${rightPoint.y}`;
  };

  getStyledChartData = (
    idx: number,
    data: IStockData,
    isHoverActive: boolean,
    selection?: IDragSelection,
  ) => {
    const selectionSignature = this.getSelectionSignature(selection);
    const cached = this.chartStyleCache[idx];
    if (
      cached &&
      cached.sourceData === data &&
      cached.selectionSignature === selectionSignature &&
      cached.isHoverActive === isHoverActive
    ) {
      return cached.chartData;
    }

    const chartData = {
      ...data,
      datasets: data.datasets.map((dataset) => ({
        ...dataset,
        ...(dataset.data.length > 1
          ? (() => {
              const firstPoint = dataset.data[0];
              const lastPoint = dataset.data[dataset.data.length - 1];
              const displayRangeColor = this.getTrendColor(firstPoint.y, lastPoint.y);
              const hoverBaseColor = "#2563eb";

              if (!selection) {
                return {
                  fill: true,
                  borderColor: isHoverActive ? hoverBaseColor : displayRangeColor,
                  backgroundColor: this.withOpacity(
                    isHoverActive ? hoverBaseColor : displayRangeColor,
                    0.12,
                  ),
                  segment: {
                    borderColor: () =>
                      isHoverActive ? hoverBaseColor : displayRangeColor,
                    borderWidth: () => 2,
                  },
                };
              }

              const { leftPoint, rightPoint } = this.getNormalizedRange(selection);
              const selectedStart = Math.min(leftPoint.index, rightPoint.index);
              const selectedEnd = Math.max(leftPoint.index, rightPoint.index);
              const selectedRangeColor = this.getTrendColor(leftPoint.y, rightPoint.y);

              return {
                fill: true,
                borderColor: displayRangeColor,
                backgroundColor: this.withOpacity(selectedRangeColor, 0.3),
                segment: {
                  borderColor: (ctx: ScriptableLineSegmentContext) => {
                    const inSelection =
                      ctx.p0DataIndex >= selectedStart && ctx.p1DataIndex <= selectedEnd;
                    return inSelection
                      ? selectedRangeColor
                      : this.withOpacity(displayRangeColor, 0.3);
                  },
                  borderWidth: (ctx: ScriptableLineSegmentContext) => {
                    const inSelection =
                      ctx.p0DataIndex >= selectedStart && ctx.p1DataIndex <= selectedEnd;
                    return inSelection ? 2.5 : 2;
                  },
                },
              };
            })()
          : {}),
      })),
    } as IStockData;

    this.chartStyleCache[idx] = {
      sourceData: data,
      selectionSignature,
      isHoverActive,
      chartData,
    };

    return chartData;
  };

  callDayTrade = (): Promise<string> => {
    return fetch(
      "/trade/day-trade?stopGain=1.03&stopLoss=0.97&stabilityTime=10&min=1",
    )
      .then((res) => res.json())
      .catch((err) => {
        console.log(err);
        return err;
      });
  };

  callEarningTrade = (): Promise<string> => {
    return fetch("/trade/earnings-strategy")
      .then((res) => res.json())
      .then((obj) => {
        this.createChartStockData(obj);
      })
      .catch((err) => {
        console.log(err);
        return err;
      });
  };

  callEarnings = () => {
    const startTime = new Date("November 18, 2019 09:30").getTime();
    const stopLoss = 0.98;
    const stopGain = 1.02;
    return fetch(
      "/trade/earnings-strategy?startTime=" +
        startTime +
        "&stopLoss=" +
        stopLoss +
        "&stopGain=" +
        stopGain,
    )
      .then((res) => res.json())
      .then((obj) => {
        this.createChartStockData(obj);
      })
      .catch((err) => {
        console.log(err);
        return err;
      });
  };

  test = () => {
    const gains = this.callEarningTrade();
    gains.then((res) => {
      console.log(res);
    });
    // this.createChart(gains);
  };

  createChartWithGains = (gains: IGain[]) => {
    const labels = new Array<number>();
    const lastLabel = gains[0].time;
    for (let i = 0; i < lastLabel; i++) {
      labels.push(i);
    }
    const data = new Array<IPoint>();
    for (const gain of gains) {
      data.push({ x: gain.time, y: gain.gain });
    }
  };

  buildStockData = (stock: ChartStockItem): IStockData => {
    const labels = new Array<string>();
    const data = new Array<IPoint>();
    let lastTime = 0;
    for (const candle of stock.candles) {
      const currentTime = candle.time;
      if (currentTime === 0 || currentTime - lastTime >= 1) {
        data.push({ x: currentTime, y: candle.price, datetime: candle.datetime });
        lastTime = currentTime;
      }
    }
    const datasets = [
      {
        fill: false,
        borderColor: "#FFA726",
        backgroundColor: "#FFCC80",
        label: stock.symbol,
        data,
      },
    ];
    return { labels, datasets };
  };

  createChartStockData = (obj: IChartStockData, reset = true) => {
    const arr = obj.obj;
    const stockDataList = reset
      ? new Array<IStockData>()
      : [...this.state.stockDataList];
    const chartTimeRanges = reset
      ? {}
      : { ...this.state.chartTimeRanges };

    for (const stock of arr) {
      stockDataList.push(this.buildStockData(stock));
      chartTimeRanges[stockDataList.length - 1] =
        chartTimeRanges[stockDataList.length - 1] ?? DEFAULT_TIME_RANGE;
    }

    this.setState({
      stockDataList,
      chartTimeRanges,
      dragSelections: reset ? {} : this.state.dragSelections,
      activeDragChartIdx: reset ? null : this.state.activeDragChartIdx,
    });
    this.chartStyleCache = {};
    this.liveDragSelections = {};
    Object.keys(this.hoverLineRefs).forEach((key) => {
      const idx = Number(key);
      this.hideHoverOverlay(idx);
      this.hideDragPreview(idx);
    });
  };

  getSymbolList = (input: string) => {
    return input
      .split(",")
      .map((symbol) => symbol.trim())
      .filter((symbol) => symbol.length > 0);
  };

  getData = async (input = this.state.input, reset = true) => {
    const useGroupMode = this.state.inputMode === "group";
    const symbols = useGroupMode ? undefined : this.getSymbolList(input);
    const groupId = useGroupMode ? this.state.selectedGroup.id : undefined;

    if (!useGroupMode && (!symbols || symbols.length === 0)) {
      alert("Please enter at least one stock symbol.");
      return;
    }
    if (useGroupMode && !groupId) {
      alert("Please select a stock group.");
      return;
    }

    const { frequencyMinutes } = getResolution(DEFAULT_TIME_RANGE);
    const startTime = this.state.showSpecificRange
      ? this.state.fromDate.getTime()
      : getRangeStartDate(DEFAULT_TIME_RANGE).getTime();
    const endTime = this.state.showSpecificRange
      ? this.state.toDate.getTime()
      : new Date().getTime();

    return StockAppAPI.getCandleData(
      symbols,
      startTime,
      endTime,
      frequencyMinutes,
      false,
      groupId,
    )
      .then((obj) => {
        this.createChartStockData(obj, reset);
      })
      .catch((err) => {
        console.log(err);
        return err;
      });
  };

  refreshSingleChart = async (chartIdx: number, rangeKey: TimeRangeKey) => {
    const symbol = this.state.stockDataList[chartIdx]?.datasets?.[0]?.label;
    if (!symbol) {
      return;
    }
    const { frequencyMinutes } = getResolution(rangeKey);
    const startTime = this.state.showSpecificRange
      ? this.state.fromDate.getTime()
      : getRangeStartDate(rangeKey).getTime();
    const endTime = this.state.showSpecificRange
      ? this.state.toDate.getTime()
      : new Date().getTime();

    try {
      const obj = await StockAppAPI.getCandleData(
        [symbol],
        startTime,
        endTime,
        frequencyMinutes,
        false,
      );
      const updatedStock = obj.obj[0];
      if (!updatedStock) {
        return;
      }
      this.setState((prev) => {
        const stockDataList = [...prev.stockDataList];
        stockDataList[chartIdx] = this.buildStockData(updatedStock);
        const dragSelections = { ...prev.dragSelections };
        delete dragSelections[chartIdx];
        return {
          stockDataList,
          dragSelections,
          activeDragChartIdx:
            prev.activeDragChartIdx === chartIdx ? null : prev.activeDragChartIdx,
        };
      });
      delete this.liveDragSelections[chartIdx];
      this.chartStyleCache[chartIdx] = undefined;
      this.hideHoverOverlay(chartIdx);
      this.hideDragPreview(chartIdx);
    } catch (err) {
      console.log(err);
    }
  };

  handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ input: e.target.value });
  };

  handleFromDateChange = (event: FormEvent<Date>) => {
    if (event.value) {
      this.setState({ fromDate: event.value });
    }
  };

  handleToDateChange = (event: FormEvent<Date>) => {
    if (event.value) {
      this.setState({ toDate: event.value });
    }
  };

  getPostEarningsGains = () => {
    const earningsTime = new Date(this.state.fromDate).getTime();
    return fetch(
      "/trade/post-earnings?symbols=" +
        this.state.input +
        "&earningsTime=" +
        earningsTime,
    )
      .then((res) => res.json())
      .then((obj) => {
        this.createChartStockData(obj);
      })
      .catch((err) => {
        console.log(err);
        return err;
      });
  };

  showSandP = async () => {
    StockAppAPI.getStockNames("ipo stocks").then(
      async (data: IStockNameData) => {
        const names = data.data.names;
        const namesArr = names.split(",");
        // const namesArr = ['NCNO'];
        let idx = 0;
        // let chunk = namesArr.slice(idx, idx + 119);
        let chunk = namesArr.slice(idx, idx + 100);
        idx += 119;
        await this.getData(chunk.join(","));
        // await this.getData('NCNO');
        console.log("got first chunk");
        if (names.length > 119) {
          const interval = setInterval(() => {
            console.log("getting next chunk");
            try {
              chunk = namesArr.slice(idx, idx + 119);
              idx += 119;
              if (chunk.length === 0) {
                console.log("interval cleared");
                clearInterval(interval);
              } else {
                this.getData(chunk.join(","), false);
              }
            } catch (err) {
              console.log(err);
              clearInterval(interval);
            }
          }, 61000);
        }
        // this.getData(data.data.names);
      },
    );
  };

  selectShowSpecificRange = (e: CheckboxChangeEvent) => {
    this.setState({ showSpecificRange: e.checked ?? false });
  };

  selectChartTimeRange = (chartIdx: number, rangeKey: TimeRangeKey) => {
    this.setState(
      (prev) => ({
        chartTimeRanges: {
          ...prev.chartTimeRanges,
          [chartIdx]: rangeKey,
        },
      }),
      () => {
        void this.refreshSingleChart(chartIdx, rangeKey);
      },
    );
  };

  render() {
    const dataToDisplay =
      this.state.stockDataList.length > 0
        ? this.state.stockDataList
        : undefined;
    let charts;
    if (dataToDisplay) {
      charts = dataToDisplay.map((data, idx) => {
        const chartOptions = this.getChartOptions(idx);
        const selectedRange = this.getTimeRangeForChart(idx);
        const selection = this.liveDragSelections[idx] ?? this.state.dragSelections[idx];
        const isHoverActive = this.state.hoveredChartIdx === idx && this.state.activeDragChartIdx !== idx;
        const chartData = this.getStyledChartData(idx, data, isHoverActive, selection);
        return (
          <div
            key={idx}
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: "10px",
              padding: "0.75rem",
              background: "#ffffff",
            }}
          >
            {data.datasets[0].label}
            <div style={{ marginTop: "0.35rem", marginBottom: "0.5rem", display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
              {TIME_RANGE_LABELS.map((rangeKey) => (
                <button
                  key={`${idx}-${rangeKey}`}
                  onClick={() => this.selectChartTimeRange(idx, rangeKey)}
                  style={{
                    padding: "0.25rem 0.65rem",
                    borderRadius: "999px",
                    border: "1px solid",
                    borderColor: selectedRange === rangeKey ? "#2563eb" : "#d1d5db",
                    background: selectedRange === rangeKey ? "#2563eb" : "#ffffff",
                    color: selectedRange === rangeKey ? "#ffffff" : "#374151",
                    fontWeight: selectedRange === rangeKey ? 600 : 400,
                    fontSize: "0.8rem",
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {rangeKey}
                </button>
              ))}
            </div>
            {this.renderSelectionHeader(idx)}
            <div
              ref={this.setChartContainerRef(idx)}
              onMouseDown={this.handleChartMouseDown(idx)}
              onMouseEnter={this.handleChartMouseEnter(idx)}
              onMouseMove={this.handleChartMouseMove(idx)}
              onMouseLeave={this.handleChartMouseLeave(idx)}
              style={{ cursor: "crosshair" }}
            >
              <div style={{ height: "280px", position: "relative" }}>
                <Chart
                  ref={this.setChartRef(idx)}
                  type="line"
                  data={chartData}
                  options={chartOptions}
                ></Chart>
                <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                  {this.renderSelectionOverlay(idx)}
                  {this.renderSelectionValueOverlay(idx)}
                  <div
                    ref={this.setDragDimLeftRef(idx)}
                    style={{ display: "none", position: "absolute" }}
                  ></div>
                  <div
                    ref={this.setDragDimRightRef(idx)}
                    style={{ display: "none", position: "absolute" }}
                  ></div>
                  <div
                    ref={this.setDragSelectionFillRef(idx)}
                    style={{ display: "none", position: "absolute" }}
                  ></div>
                  <div
                    ref={this.setDragSelectionFillRef(idx)}
                    style={{ display: "none", position: "absolute" }}
                  ></div>
                  <div
                    ref={this.setDragLineStartRef(idx)}
                    style={{ display: "none", position: "absolute" }}
                  ></div>
                  <div
                    ref={this.setDragLineEndRef(idx)}
                    style={{ display: "none", position: "absolute" }}
                  ></div>
                  <div
                    ref={this.setDragCircleStartRef(idx)}
                    style={{ display: "none", position: "absolute" }}
                  ></div>
                  <div
                    ref={this.setDragCircleEndRef(idx)}
                    style={{ display: "none", position: "absolute" }}
                  ></div>
                  <div
                    ref={this.setDragPercentLabelRef(idx)}
                    style={{
                      display: "none",
                      position: "absolute",
                      transform: "translateX(-50%)",
                      fontWeight: "700",
                      fontSize: "1rem",
                      whiteSpace: "nowrap",
                    }}
                  ></div>
                  <div
                    ref={this.setDragDollarLabelRef(idx)}
                    style={{
                      display: "none",
                      position: "absolute",
                      transform: "translateX(-100%)",
                      fontWeight: "700",
                      fontSize: "1rem",
                      whiteSpace: "nowrap",
                    }}
                  ></div>
                  <div
                    ref={this.setHoverLineRef(idx)}
                    style={{
                      display: "none",
                      position: "absolute",
                      width: "2px",
                      background: "#2563eb",
                      transform: "translateX(-1px)",
                    }}
                  ></div>
                  <div
                    ref={this.setHoverCircleRef(idx)}
                    style={{
                      display: "none",
                      position: "absolute",
                      width: "10px",
                      height: "10px",
                      borderRadius: "50%",
                      border: "2px solid #2563eb",
                      background: "#ffffff",
                      transform: "translate(-50%, -50%)",
                      boxSizing: "border-box",
                    }}
                  ></div>
                </div>
              </div>
              <div
                style={{
                  position: "relative",
                  height: "1.8rem",
                  marginTop: "0.1rem",
                  pointerEvents: "none",
                }}
              >
                <div
                  ref={this.setHoverInfoRef(idx)}
                  style={{
                    display: "none",
                    position: "absolute",
                    left: "0px",
                    top: "0px",
                    transform: "translateX(-50%)",
                    background: "#111827",
                    color: "#ffffff",
                    borderRadius: "4px",
                    padding: "0.2rem 0.5rem",
                    fontSize: "0.75rem",
                    whiteSpace: "nowrap",
                  }}
                ></div>
              </div>
            </div>
          </div>
        );
      });
    }

    const showCharts = () => {
      this.getData();
    };

    // const options = [{ label: 'Earnings day', value: 'Earnings'}, { label: 'Five days before earnings', value: 'Pre-earnings'},
    //   { label: 'Five days after earnings', value: 'Post-earnings' }];

    return (
      <div className="main" style={{ maxWidth: "1120px", margin: "0 auto", padding: "1rem" }}>
        <h2 style={{ marginBottom: "0.25rem" }}>Stock Charts</h2>
        <p style={{ marginTop: 0, marginBottom: "1rem", color: "#4b5563" }}>
          Select symbols or a stock group, choose a date range, then drag on a chart to inspect percent change.
        </p>
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: "10px",
            padding: "1rem",
            background: "#fafafa",
            marginBottom: "1rem",
          }}
        >
          <div style={{ display: "flex", gap: "1rem", alignItems: "center", marginBottom: "0.75rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <RadioButton
                inputId="input-mode-symbols"
                value="symbols"
                name="inputMode"
                onChange={this.selectInputMode}
                checked={this.state.inputMode === "symbols"}
              />
              <label htmlFor="input-mode-symbols">Symbols</label>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <RadioButton
                inputId="input-mode-group"
                value="group"
                name="inputMode"
                onChange={this.selectInputMode}
                checked={this.state.inputMode === "group"}
              />
              <label htmlFor="input-mode-group">Group</label>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem" }}>
            <div>
              <label style={{ display: "block", marginBottom: "0.25rem" }}>Symbols</label>
              <InputText
                value={this.state.input}
                onChange={this.handleInputChange}
                disabled={this.state.inputMode !== "symbols"}
                placeholder="AAPL,MSFT,NVDA"
                style={{ width: "100%" }}
              />
            </div>

            <div>
              <label style={{ display: "block", marginBottom: "0.25rem" }}>Stock Group</label>
              <AutoComplete
                field="name"
                completeMethod={this.searchGroups}
                suggestions={this.state.filteredGroups}
                value={this.state.selectedGroup}
                onChange={this.changeGroupName}
                forceSelection
                dropdown
                placeholder="Type a stock group"
                disabled={this.state.inputMode !== "group"}
                style={{ width: "100%" }}
              />
            </div>

            {this.state.showSpecificRange && (
              <div>
                <label style={{ display: "block", marginBottom: "0.25rem" }}>From Date</label>
                <Calendar
                  value={this.state.fromDate}
                  onChange={this.handleFromDateChange}
                  showIcon
                  dateFormat="yy-mm-dd"
                  style={{ width: "100%" }}
                />
              </div>
            )}

            {this.state.showSpecificRange && (
              <div>
                <label style={{ display: "block", marginBottom: "0.25rem" }}>To Date</label>
                <Calendar
                  value={this.state.toDate}
                  onChange={this.handleToDateChange}
                  showIcon
                  dateFormat="yy-mm-dd"
                  style={{ width: "100%" }}
                />
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", paddingTop: "1.5rem" }}>
              <Checkbox onChange={this.selectShowSpecificRange} checked={this.state.showSpecificRange}></Checkbox>
              <label>Show specific range</label>
            </div>
          </div>

          <div style={{ marginTop: "1rem" }}>
            <Button label="Display charts" onClick={showCharts}></Button>
          </div>
        </div>

        <div style={{ display: "grid", gap: "1rem" }}>
          {charts}
        </div>
        {/* <h1>{this.state.stockSymbol}</h1> */}
        {/* <Chart type='line' data={dataToDisplay} /> */}
        {/* <img src={logo} className="App-logo" alt="logo" /> */}
        {/* <Button label="Store history" onClick={this.storeHistory}></Button> */}
        {/* <button onClick={test}>Click this to send request</button> */}
      </div>
    );
  }
}

export default ShowCharts;
