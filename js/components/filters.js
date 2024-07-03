/**
 * @author Chirag Jayswal, QAF team
 * Filter, sort, and search UI controls
 */
const FiltersComponent = (function () {
  function createFilters(containerId, config) {
    const {
      searchPlaceholder = 'Search...',
      searchFields = [],
      onSearch,
      filterOptions = [],
      onFilterChange,
      sortOptions = [],
      onSortChange,
      debounceMs = 200
    } = config;

    const container = document.getElementById(containerId);
    if (!container) return null;

    const wrap = document.createElement('div');
    wrap.className = 'filters-bar';

    if (searchPlaceholder && onSearch) {
      const searchWrap = document.createElement('div');
      searchWrap.className = 'filter-search';
      const input = document.createElement('input');
      input.type = 'search';
      input.placeholder = searchPlaceholder;
      input.className = 'filter-input';
      input.setAttribute('aria-label', 'Search');
      const debouncedSearch = Utils.debounce((val) => onSearch(val), debounceMs);
      input.addEventListener('input', () => debouncedSearch(input.value));
      searchWrap.appendChild(input);
      wrap.appendChild(searchWrap);
    }

    if (filterOptions.length && onFilterChange) {
      filterOptions.forEach(opt => {
        const div = document.createElement('div');
        div.className = 'filter-group';
        const label = document.createElement('label');
        label.textContent = opt.label + ': ';
        const select = document.createElement('select');
        select.className = 'filter-select';
        select.dataset.filterKey = opt.key;
        const options = [{ value: '', text: 'All' }, ...(opt.options || [])];
        options.forEach(o => {
          const option = document.createElement('option');
          option.value = o.value ?? o;
          option.textContent = o.text ?? o;
          select.appendChild(option);
        });
        select.addEventListener('change', () => onFilterChange(opt.key, select.value || null));
        div.appendChild(label);
        div.appendChild(select);
        wrap.appendChild(div);
      });
    }

    if (sortOptions.length && onSortChange) {
      const div = document.createElement('div');
      div.className = 'filter-group';
      const label = document.createElement('label');
      label.textContent = 'Sort: ';
      const select = document.createElement('select');
      select.className = 'filter-select';
      sortOptions.forEach(o => {
        const option = document.createElement('option');
        const key = o.value ?? o.key;
        const asc = o.asc !== false;
        option.value = key + ':' + (asc ? 'asc' : 'desc');
        option.textContent = o.label ?? key;
        select.appendChild(option);
      });
      select.addEventListener('change', () => {
        const [key, dir] = (select.value || '').split(':');
        if (key) onSortChange(key, dir === 'asc');
      });
      div.appendChild(label);
      div.appendChild(select);
      wrap.appendChild(div);
    }

    container.appendChild(wrap);
    return {
      getElement: () => wrap,
      setSearchValue: (val) => {
        const input = wrap.querySelector('.filter-input');
        if (input) input.value = val;
      }
    };
  }

  return { createFilters };
})();
