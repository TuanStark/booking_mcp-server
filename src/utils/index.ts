export * from './datetime';

export const delayMS = async (ms: number): Promise<void> => {
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      resolve();
    }, ms);
  });
};

export function getRandomElements<T>(array: T[], numElements: number): T[] {
  const shuffled = array.sort(() => 0.5 - Math.random());
  return shuffled.slice(0, numElements);
}

export function isEmail(value: string): boolean {
  return /\S+@\S+\.\S+/.test(value);
}
