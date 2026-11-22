import { IPosition } from "../shared/trading-types";
import { IOrder, IPriceQuotes } from "../shared/types";

export function validateSelectedPositions(
  positions: IPosition[],
  limitPercent: string,
  orderType: string,
  quantityPercent: string,
) {
  let errorMsg = "";
  for (const pos of positions) {
    if (!pos.market && !pos.limitPrice && !limitPercent) {
      errorMsg =
        "No limit price specified for position " + pos.instrument.symbol;
      break;
    }
    if (!orderType) {
      errorMsg =
        "No order type specified for position " + pos.instrument.symbol;
      break;
    }
    if (!pos.orderQuantity && !quantityPercent) {
      errorMsg =
        "No order quantity specified for position " + pos.instrument.symbol;
      break;
    }
  }
  return errorMsg;
}

function getPrice(quote: { bid: number; ask: number }, limitPercent: number) {
  const bid = quote.bid;
  const ask = quote.ask;
  const midPoint = (bid + ask) / 2;
  return Math.round((midPoint * 100 * limitPercent) / 100) / 100;
}

function getQuantity(longQuantity: number, quantityPercent: number) {
  return Math.round((longQuantity * quantityPercent) / 100);
}

export function generateOrders(
  positions: IPosition[],
  orderType: string,
  marketOrder: boolean,
  limitPercent: number,
  quantityPercent: number,
  quotes: IPriceQuotes,
) {
  const orders = new Array<IOrder>();

  for (const pos of positions) {
    // if (!pos.selected) {
    //     continue;
    // }
    const symbol = pos.instrument.symbol.replace(/ /g, "");
    if (pos.longQuantity) {
      const quantity = getQuantity(pos.longQuantity, quantityPercent);
      const positionOrderType = pos.order ?? orderType;
      //const price = pos.market ? 0 : pos.purchasePrice;
      const price = pos.market ? 0 : getPrice(quotes[symbol], limitPercent);
      orders.push({
        marketOrder,
        option: pos.instrument.assetType === "OPTION",
        symbol: pos.instrument.symbol,
        shares: quantity,
        orderType: positionOrderType,
        price,
      });
    }
  }
  return orders;
}
