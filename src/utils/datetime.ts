import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

// Extend Day.js with the plugins
dayjs.extend(utc);
dayjs.extend(timezone);

export const getCurrentUTCTime = () => {
  const nowUtc = dayjs().utc();
  return nowUtc.toISOString();
};
