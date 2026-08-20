// The company risk ranking matrix, from sheet "5. RR Matrix" of the Risk
// Assessment workbook.
//
// Category is NOT derivable from the severity x probability rating. The same
// rating maps to different categories: severity 8 with probability 1 gives
// rating 8 and category M+, while severity 4 with probability 2 gives rating 8
// and category L. A rare catastrophe is not a common annoyance. Always look the
// category up; never threshold the rating.
//
// This mirrors Data/RiskMatrix.cs in the backend. If you change one, change
// both - but the server recomputes on save and its value is what gets stored.
// This copy exists only so the category chip updates without a round trip.
//
// See docs/superpowers/specs/2026-08-20-risk-assessment-design.md

// var, not const: this is a top-level declaration in a classic (non-module)
// script. A top-level `const`/`let` only creates a script-scope lexical
// binding, not a `window` property, so `window.RISK_SCALE_VALUES` would be
// undefined even though the bare identifier resolves fine within this file
// and to other classic scripts on the same page. `var` is the one declarator
// that actually attaches to `window` here — do not "modernise" this to const.
var RISK_SCALE_VALUES = [1, 2, 4, 6, 8, 10];

// Keyed by probability, then severity.
// var for the same reason as RISK_SCALE_VALUES above: top-level const/let in a
// classic script does not become a window property, and callers reach for
// window.RISK_MATRIX the same way they reach for window.evaluateRisk.
var RISK_MATRIX = {
  10: { 1: 'L',  2: 'H',  4: 'VH', 6: 'VH', 8: 'VH', 10: 'VH' },
  8:  { 1: 'L',  2: 'M+', 4: 'H',  6: 'VH', 8: 'VH', 10: 'VH' },
  6:  { 1: 'L',  2: 'M',  4: 'M+', 6: 'H',  8: 'VH', 10: 'VH' },
  4:  { 1: 'VL', 2: 'L',  4: 'M',  6: 'M+', 8: 'H',  10: 'VH' },
  2:  { 1: 'VL', 2: 'VL', 4: 'L',  6: 'M',  8: 'H',  10: 'H'  },
  1:  { 1: 'VL', 2: 'VL', 4: 'L',  6: 'L',  8: 'M+', 10: 'H'  },
};

// var for the same reason as RISK_SCALE_VALUES above: top-level const/let in a
// classic script does not become a window property, and this map is looked up
// as window.RISK_CATEGORY_COLOUR by other scripts.
var RISK_CATEGORY_COLOUR = {
  'VL': '#c6efce',
  'L':  '#d9ead3',
  'M':  '#ffeb9c',
  'M+': '#ffd966',
  'H':  '#f4b183',
  'VH': '#ff7c80',
};

/**
 * Returns { rating, category } for a severity and probability, or null when
 * either value is off the scale. Null rather than a guess: an unscored task
 * should read as unscored, not as low risk.
 */
function evaluateRisk(severity, probability) {
  if (RISK_SCALE_VALUES.indexOf(severity) === -1) return null;
  if (RISK_SCALE_VALUES.indexOf(probability) === -1) return null;

  return {
    rating: severity * probability,
    category: RISK_MATRIX[probability][severity],
  };
}
