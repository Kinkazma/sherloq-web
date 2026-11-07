/** Compact display labels only; native scores and exports retain their precision. */
export function formatResponseScaleValue(value,language='fr'){
 if(!Number.isFinite(value))return String(value);
 const magnitude=Math.abs(value),options=magnitude>=1e6||magnitude>0&&magnitude<1e-3?{notation:'scientific',maximumSignificantDigits:4}:{maximumSignificantDigits:4};
 return new Intl.NumberFormat(language==='en'?'en':'fr',options).format(value);
}
