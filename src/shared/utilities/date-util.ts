function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 6 || day === 0; // Saturday or Sunday
}

function isHoliday(date: Date): boolean {
  return [
    isNewYearsDay(date), // New Year's Day
    isMartinLutherKingDay(date), // Martin Luther King Jr. Day
    isPresidentsDay(date), // Presidents' Day
    isMemorialDay(date), // Memorial Day
    isJuneteenth(date), // Juneteenth
    isIndependenceDay(date), // Independence Day
    isLaborDay(date), // Labor Day
    isThanksgiving(date), // Thanksgiving
    isChristmasDay(date), // Christmas Day
  ].some(Boolean);
}

// New Year's Day (January 1st)
function isNewYearsDay(date: Date): boolean {
  return date.getMonth() === 0 && date.getDate() === 1;
}

// Martin Luther King Jr. Day (Third Monday of January)
function isMartinLutherKingDay(date: Date): boolean {
  return (
    date.getMonth() === 0 &&
    date.getDay() === 1 &&
    date.getDate() >= 15 &&
    date.getDate() <= 21
  );
}

// Presidents' Day (Third Monday of February)
function isPresidentsDay(date: Date): boolean {
  return (
    date.getMonth() === 1 &&
    date.getDay() === 1 &&
    date.getDate() >= 15 &&
    date.getDate() <= 21
  );
}

// Memorial Day (Last Monday of May)
function isMemorialDay(date: Date): boolean {
  return date.getMonth() === 4 && date.getDay() === 1 && date.getDate() >= 25;
}

// Juneteenth (June 19th)
function isJuneteenth(date: Date): boolean {
  return date.getMonth() === 5 && date.getDate() === 19;
}

// Independence Day (July 4th)
function isIndependenceDay(date: Date): boolean {
  return date.getMonth() === 6 && date.getDate() === 4;
}

// Labor Day (First Monday of September)
function isLaborDay(date: Date): boolean {
  return date.getMonth() === 8 && date.getDay() === 1 && date.getDate() <= 7;
}

// Thanksgiving (Fourth Thursday of November)
function isThanksgiving(date: Date): boolean {
  return (
    date.getMonth() === 10 &&
    date.getDay() === 4 &&
    Math.ceil(date.getDate() / 7) === 4
  );
}

// Christmas Day (December 25th)
function isChristmasDay(date: Date): boolean {
  return date.getMonth() === 11 && date.getDate() === 25;
}

export function tradingDaysSince(
  startDateMs: number,
  endDateMs: number,
): number {
  const startDate = new Date(startDateMs);
  const endDate = new Date(endDateMs);

  // Initialize the count of trading days
  let tradingDays = 0;

  // Adjust startDate to be the day after the given start date
  startDate.setDate(startDate.getDate() + 1);

  // Loop from the start date to the end date (inclusive)
  const currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    if (!isWeekend(currentDate) && !isHoliday(currentDate)) {
      tradingDays++;
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return tradingDays;
}
