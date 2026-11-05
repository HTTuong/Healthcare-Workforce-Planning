// Fake but readable names, so a screenshot or a report shows "Aino Virtanen" instead of "user-7f3a". The pairs
// repeat; the email, which is unique, tells people apart.

const FIRST = ['Aino', 'Eero', 'Helmi', 'Juho', 'Linnea', 'Matias', 'Noora', 'Onni', 'Saga', 'Veeti', 'Iida', 'Leevi'];
const LAST = ['Virtanen', 'Korhonen', 'Mäkinen', 'Nieminen', 'Hämäläinen', 'Laine', 'Heikkinen', 'Koskinen', 'Järvinen', 'Lehtonen'];

let next = 0;

export function personName(): { firstName: string; lastName: string } {
  const n = next++;
  return { firstName: FIRST[n % FIRST.length]!, lastName: LAST[Math.floor(n / FIRST.length) % LAST.length]! };
}
