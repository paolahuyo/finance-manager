/** Best-effort category guess from the merchant text. The user can change it in the review screen. */
const RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/uber\s*\*?\s*eats|rappi|domicilios?/i, 'Alimentación'],
  [/uber|taxi|cabify|didi|beat\b|transmilenio|parqueadero|gasolin|terpel|texaco|shell|speedway|peaje/i, 'Transporte'],
  [/apple\.com|netflix|spotify|hbo|disney|prime video|youtube|airbnb|cine|boost mobile/i, 'Entretenimiento'],
  [/walgreens|farmatodo|drogu|cruz verde|cl[ií]nica|medic|diagnost|salud|eps\b/i, 'Salud'],
  [/shein|zara|ross stores|marshalls|t\.?\s?j\.?\s?maxx|sephora|ulta|h&m|nike|adidas/i, 'Ropa'],
  [/restaur|grill|caf[eé]|coffee|bagel|sushi|pizza|smoothie|bar\b|tst\s?\*|sq\s?\*|food|wine|spirits|7-eleven|dollar tree|costco|walmart|wm supercenter|target|[eé]xito|jumbo|carulla|ol[ií]mpica|d1\b|ara\b/i, 'Alimentación'],
  [/amazon|mercado\s?libre/i, 'Otros gastos']
];

export function suggestCategoryName(description: string): string | null {
  for (const [pattern, name] of RULES) if (pattern.test(description)) return name;
  return null;
}
