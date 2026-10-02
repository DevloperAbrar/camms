const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven',
    'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  
  const twoDigits = (n) => (n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : ''));
  
  function threeDigits(n) {
    const h = Math.floor(n / 100);
    const r = n % 100;
    return (h ? `${ONES[h]} Hundred${r ? ' ' : ''}` : '') + (r ? twoDigits(r) : '');
  }
  
  // Indian numbering: 1234567.5 -> "Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven Rupees and Fifty Paise Only"
  function amountInWords(amount) {
    const total = Math.round(Number(amount) * 100) / 100;
    const rupees = Math.floor(total);
    const paise = Math.round((total - rupees) * 100);
    if (rupees === 0 && paise === 0) return 'Zero Rupees Only';
  
    let n = rupees;
    const crore = Math.floor(n / 10000000); n %= 10000000;
    const lakh = Math.floor(n / 100000); n %= 100000;
    const thousand = Math.floor(n / 1000); n %= 1000;
  
    const parts = [];
    if (crore) parts.push(`${threeDigits(crore)} Crore`);
    if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
    if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
    if (n) parts.push(threeDigits(n));
  
    let out = `${parts.length ? parts.join(' ') : 'Zero'} Rupees`;
    if (paise) out += ` and ${twoDigits(paise)} Paise`;
    return `${out} Only`;
  }
  
  module.exports = { amountInWords };