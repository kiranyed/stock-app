import { CONSTANTS } from "../constants";

let offset = 0;
export function getNextDSTTransition() {
  const now = new Date();
  const year = now.getFullYear();
  const dstStart = new Date(`March 14, ${year} 02:00:00`).getTime();
  const dstEnd = new Date(`November 7, ${year} 02:00:00`).getTime();

  if (now.getTime() < dstStart) {
    return new Date(dstStart);
  } else if (now.getTime() < dstEnd) {
    return new Date(dstEnd);
  } else {
    return new Date(`March 14, ${year + 1} 02:00:00`);
  }
}

export function scheduleNextUpdate() {
  const nextDST = getNextDSTTransition();
  const timeout = nextDST.getTime() - Date.now();

  setTimeout(() => {
    console.log("Updating offset...");
    updateEastCoastOffset(); // Recalculate offset and reschedule
  }, timeout);
}

function updateEastCoastOffset() {
  function getOffset() {
    const now = new Date();
    const eastCoastOffset = now.toLocaleTimeString("en-US", {
      timeZone: "America/New_York",
      hour12: false,
    });
    const utcOffset = now.toISOString().slice(11, 19);
    const [eastCoastHours, eastCoastMinutes, eastCoastSeconds] = eastCoastOffset
      .split(":")
      .map(Number);
    const [utcHours, utcMinutes, utcSeconds] = utcOffset.split(":").map(Number);

    const eastCoastTotalMinutes =
      eastCoastHours * CONSTANTS.MINS_IN_HOUR +
      eastCoastMinutes +
      eastCoastSeconds / CONSTANTS.MINS_IN_HOUR;
    const utcTotalMinutes =
      utcHours * CONSTANTS.MINS_IN_HOUR +
      utcMinutes +
      utcSeconds / CONSTANTS.MINS_IN_HOUR;

    return eastCoastTotalMinutes - utcTotalMinutes;
  }

  offset = getOffset();
  console.log(`Current East Coast offset from UTC: ${offset} minutes`);

  scheduleNextUpdate();
}

//updateEastCoastOffset();
export function getOffset() {
  return offset;
}
