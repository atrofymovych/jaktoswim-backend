const jsFilterSortPaginate = (arr, { dataFilter, sortBy, limit = 100, skip = 0 } = {}) => {
  if (dataFilter && typeof dataFilter === 'object' && Object.keys(dataFilter).length) {
    arr = arr.filter((item) => {
      if (typeof item.data !== 'string') return false;
      const parsed = safeParse(item.data);
      if (!parsed || typeof parsed !== 'object') return false;
      for (const k in dataFilter) {
        if (parsed[k] != dataFilter[k]) return false;
      }
      return true;
    });
  }

  const sortOptions = sortBy && typeof sortBy === 'object' && Object.keys(sortBy).length ? sortBy : { createdAt: -1 };
  const field = Object.keys(sortOptions)[0];
  const order = sortOptions[field] === -1 ? -1 : 1;

  arr.sort((a, b) => {
    const av = a[field];
    const bv = b[field];
    if (av > bv) return order;
    if (av < bv) return -order;
    return 0;
  });

  limit = Number.isInteger(limit) && limit > 0 ? limit : 100;
  skip = Number.isInteger(skip) && skip >= 0 ? skip : 0;
  return arr.slice(skip, skip + limit);
};

module.exports = { jsFilterSortPaginate };
