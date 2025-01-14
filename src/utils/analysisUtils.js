const SIGNIFICANT_CHANGE_THRESHOLD = 0.1; // 10% change threshold

const hasSignificantChange = (oldMetrics, newMetrics) => {
  if (!oldMetrics || !newMetrics) return true;

  // Helper function to compare numeric values
  const hasChanged = (oldVal, newVal) => {
    if (typeof oldVal !== 'number' || typeof newVal !== 'number') return false;
    const change = Math.abs((newVal - oldVal) / oldVal);
    return change > SIGNIFICANT_CHANGE_THRESHOLD;
  };

  // Compare each metric
  for (const key in newMetrics) {
    if (hasChanged(oldMetrics[key], newMetrics[key])) {
      return true;
    }
  }

  return false;
};

module.exports = {
  hasSignificantChange
};