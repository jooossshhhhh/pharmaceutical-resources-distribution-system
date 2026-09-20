const getErrorMessage = (error) => {
  if (!error) {
    return "Unknown error";
  }

  return error.message || String(error);
};

export const getSnapshotFailureMessage = (results, sourceNames = []) => {
  const failures = results
    .map((result, index) => ({ result, index }))
    .filter(({ result }) => result?.error);

  if (failures.length === 0) {
    return "";
  }

  const failureDetails = failures.map(({ result, index }) => {
    const sourceName = sourceNames[index] || `Source ${index + 1}`;
    return `${sourceName}: ${getErrorMessage(result.error)}`;
  });

  return `${failures.length} data source${failures.length === 1 ? "" : "s"} could not be refreshed. ${failureDetails.join("; ")}`;
};

export async function fetchAllRows(buildQuery, pageSize = 1000) {
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await buildQuery().range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return rows;
  }
}
