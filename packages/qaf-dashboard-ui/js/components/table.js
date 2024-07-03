/**
 * @author Chirag Jayswal, QAF team
 * Reusable data table with filter, sort, search, and lazy loading
 */
const TableComponent = (function () {
  function createTable(containerId, config) {
    const {
      columns,
      data = [],
      idField = 'id',
      searchFields = [],
      filterConfig = {},
      sortable = true,
      onRowClick,
      expandableRow,
      onExpand,
      pageSize = 50,
      getGroupCounts,
      groupByValueGetters = {},
      expandStatusKey = 'result'
    } = config;

    const container = document.getElementById(containerId);
    if (!container) return null;

    const effectiveOnRowClick = onRowClick || (expandableRow ? (row) => {
      const rowId = row[idField];
      if (expandedRows.has(rowId)) {
        expandedRows.delete(rowId);
      } else {
        expandedRows.clear();
        expandedRows.add(rowId);
      }
      render();
    } : null);

    let allData = [...data];
    let filteredData = [...data];
    let sortColumn = null;
    let sortAsc = true;
    let groupByColumn = null;
    let searchTerm = '';
    let filters = {};
    let expandedRows = new Set();
    let expandedGroups = new Set();
    let knownGroupKeys = new Set();
    let currentPage = 0;

    const tableEl = document.createElement('div');
    tableEl.className = 'table-container';

    function getGroupKey(row) {
      if (!groupByColumn) return '';
      const customGetter = groupByValueGetters[groupByColumn];
      if (customGetter) {
        const val = customGetter(row);
        return String(val ?? '(empty)');
      }
      const col = columns.find(c => c.sortKey === groupByColumn);
      const getVal = col && col.value ? (r) => col.value(r) : (r) => r[groupByColumn];
      const val = getVal(row);
      return String(val ?? '(empty)');
    }

    function getGroupDisplayTitle(key) {
      if (key === '(empty)') return '(empty)';
      return key;
    }

    function buildGroups() {
      const map = new Map();
      filteredData.forEach((row) => {
        const key = getGroupKey(row);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(row);
      });
      return map;
    }

    function render() {
      const colCount = columns.length + (expandableRow ? 1 : 0);
      const groups = groupByColumn ? buildGroups() : null;
      let groupKeys = groups ? Array.from(groups.keys()) : [];
      if (groupByColumn && groupKeys.length > 0) {
        groupKeys.forEach(k => {
          if (!knownGroupKeys.has(k)) knownGroupKeys.add(k);
        });
        if (sortColumn && ['result', 'cycleStatus', 'overallStatus'].includes(sortColumn) && getGroupCounts) {
          groupKeys = [...groupKeys].sort((a, b) => {
            const rowsA = groups.get(a) || [];
            const rowsB = groups.get(b) || [];
            const countsA = getGroupCounts(rowsA);
            const countsB = getGroupCounts(rowsB);
            const passA = countsA.pass || 0;
            const passB = countsB.pass || 0;
            const cmp = passB - passA;
            return sortAsc ? cmp : -cmp;
          });
        }
      }

      let pageData;
      let totalForPagination;
      if (groups && groupKeys.length > 0) {
        totalForPagination = groupKeys.length;
        const start = currentPage * pageSize;
        const pageGroupKeys = groupKeys.slice(start, start + pageSize);
        pageData = pageGroupKeys.flatMap(k => groups.get(k) || []);
      } else {
        const start = currentPage * pageSize;
        pageData = filteredData.slice(start, start + pageSize);
        totalForPagination = filteredData.length;
      }

      let html = '<table class="data-table"><thead><tr>';
      if (expandableRow) html += '<th class="expand-col"></th>';
      columns.forEach(col => {
        const canSort = sortable && col.sortKey;
        const sortClass = canSort && sortColumn === col.sortKey ? (sortAsc ? 'sort-asc' : 'sort-desc') : '';
        const th = `<th class="${sortClass}" data-sort="${canSort ? col.sortKey : ''}">${col.label}</th>`;
        html += th;
      });
      html += '</tr></thead><tbody>';

      if (groups && groupKeys.length > 0) {
        const start = currentPage * pageSize;
        const pageGroupKeys = groupKeys.slice(start, start + pageSize);
        pageGroupKeys.forEach((groupKey) => {
          const rows = groups.get(groupKey) || [];
          const counts = getGroupCounts ? getGroupCounts(rows) : {
            pass: rows.filter(r => r.result === 'pass').length,
            fail: rows.filter(r => r.result === 'fail').length,
            total: rows.length
          };
          const { pass, fail, total } = counts;
          const isGroupExpanded = expandedGroups.has(groupKey);
          html += '<tr class="group-header-row" data-group-key="' + Utils.escapeHtml(groupKey) + '">';
          html += '<td colspan="' + colCount + '" class="group-header-cell">';
          html += '<button type="button" class="btn-group-toggle" aria-expanded="' + isGroupExpanded + '">' + (isGroupExpanded ? '▼' : '▶') + '</button>';
          html += '<span class="group-title">' + Utils.escapeHtml(getGroupDisplayTitle(groupKey)) + '</span>';
          html += '<span class="group-stats"><span class="pass">' + pass + ' pass</span> <span class="fail">' + fail + ' fail</span> <span class="total">' + total + ' total</span></span>';
          html += '</td></tr>';
          if (isGroupExpanded) {
            rows.forEach((row, idx) => {
              const rowId = row[idField] ?? idx;
              const isExpanded = expandedRows.has(rowId);
              const rowClass = (effectiveOnRowClick ? 'clickable' : '') + (isExpanded ? ' row-expanded' : '');
              html += '<tr data-row-id="' + (rowId || idx) + '"' + (rowClass ? ' class="' + rowClass.trim() + '"' : '') + '>';
              if (expandableRow) {
                const status = (expandStatusKey && row[expandStatusKey]) || row.result || '';
                const statusClass = status ? ' expand-col-' + String(status).replace(/\s/g, '-') : '';
                html += '<td class="expand-col' + statusClass + '">' +
                  '<button class="btn-expand" data-row-id="' + rowId + '" aria-expanded="' + isExpanded + '">' +
                  (isExpanded ? '▼' : '▶') + '</button></td>';
              }
              columns.forEach(col => {
                const val = col.value ? col.value(row) : row[col.key];
                html += '<td>' + (col.render ? col.render(val, row) : Utils.escapeHtml(String(val ?? ''))) + '</td>';
              });
              html += '</tr>';
              if (expandableRow && isExpanded) {
                html += '<tr class="expand-row" data-parent="' + rowId + '"><td colspan="' + colCount + '">';
                html += expandableRow(row);
                html += '</td></tr>';
              }
            });
          }
        });
      } else {
        pageData.forEach((row, idx) => {
          const rowId = row[idField] ?? idx;
          const isExpanded = expandedRows.has(rowId);
          const rowClass = (effectiveOnRowClick ? 'clickable' : '') + (isExpanded ? ' row-expanded' : '');
          html += '<tr data-row-id="' + (rowId || idx) + '"' + (rowClass ? ' class="' + rowClass.trim() + '"' : '') + '>';
          if (expandableRow) {
            const status = (expandStatusKey && row[expandStatusKey]) || row.result || '';
            const statusClass = status ? ' expand-col-' + String(status).replace(/\s/g, '-') : '';
            html += '<td class="expand-col' + statusClass + '">' +
              '<button class="btn-expand" data-row-id="' + rowId + '" aria-expanded="' + isExpanded + '">' +
              (isExpanded ? '▼' : '▶') + '</button></td>';
          }
          columns.forEach(col => {
            const val = col.value ? col.value(row) : row[col.key];
            html += '<td>' + (col.render ? col.render(val, row) : Utils.escapeHtml(String(val ?? ''))) + '</td>';
          });
          html += '</tr>';
          if (expandableRow && isExpanded) {
            html += '<tr class="expand-row" data-parent="' + rowId + '"><td colspan="' + colCount + '">';
            html += expandableRow(row);
            html += '</td></tr>';
          }
        });
      }

      html += '</tbody></table>';

      const allExpanded = groups && groupKeys.length > 0 && groupKeys.every(k => expandedGroups.has(k));
      const groupToolbar = (groups && groupKeys.length > 0) ? `
        <button type="button" class="group-toggle-all" title="${allExpanded ? 'Collapse all' : 'Expand all'}" aria-label="${allExpanded ? 'Collapse all' : 'Expand all'}">${allExpanded ? '−' : '▶'}</button>
      ` : '';

      const paginationStart = currentPage * pageSize;
      const pagination = totalForPagination > pageSize ? `
        <div class="pagination">
          <span>Showing ${paginationStart + 1}-${Math.min(paginationStart + pageSize, totalForPagination)} of ${totalForPagination}</span>
          <button class="btn-page" data-page="prev" ${currentPage === 0 ? 'disabled' : ''}>Previous</button>
          <span>Page ${currentPage + 1} of ${Math.ceil(totalForPagination / pageSize)}</span>
          <button class="btn-page" data-page="next" ${paginationStart + pageSize >= totalForPagination ? 'disabled' : ''}>Next</button>
        </div>
      ` : '';

      tableEl.innerHTML = groupToolbar + html + pagination;

      tableEl.querySelectorAll('.group-toggle-all').forEach(btn => {
        btn.addEventListener('click', () => {
          if (!groupByColumn || !groups) return;
          if (groupKeys.every(k => expandedGroups.has(k))) {
            expandedGroups.clear();
          } else {
            Array.from(groups.keys()).forEach(k => expandedGroups.add(k));
          }
          render();
        });
      });

      tableEl.querySelectorAll('th[data-sort]').forEach(th => {
        const key = th.dataset.sort;
        if (key) {
          th.style.cursor = 'pointer';
          th.addEventListener('click', () => handleSort(key));
        }
      });

      tableEl.querySelectorAll('tr[data-row-id].clickable').forEach(tr => {
        tr.addEventListener('click', (e) => {
          if (!e.target.closest('.btn-expand')) {
            const row = filteredData.find(r => String(r[idField] ?? '') === String(tr.dataset.rowId));
            effectiveOnRowClick && row && effectiveOnRowClick(row);
          }
        });
      });

      tableEl.querySelectorAll('.btn-expand').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const rowId = btn.dataset.rowId;
          if (expandedRows.has(rowId)) {
            expandedRows.delete(rowId);
          } else {
            expandedRows.clear();
            expandedRows.add(rowId);
          }
          render();
        });
      });

      tableEl.querySelectorAll('.btn-group-toggle').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const row = btn.closest('.group-header-row');
          const key = row?.dataset.groupKey;
          if (key !== undefined) {
            if (expandedGroups.has(key)) {
              expandedGroups.delete(key);
            } else {
              expandedGroups.add(key);
            }
            render();
          }
        });
      });

      tableEl.querySelectorAll('.btn-page').forEach(btn => {
        btn.addEventListener('click', () => {
          const totalPages = Math.ceil(totalForPagination / pageSize);
          if (btn.dataset.page === 'prev' && currentPage > 0) currentPage--;
          if (btn.dataset.page === 'next' && currentPage < totalPages - 1) currentPage++;
          render();
        });
      });

      if (onExpand && expandableRow) {
        tableEl.querySelectorAll('.expand-row [data-expand-parent]').forEach(container => {
          const rowId = container.dataset.expandParent;
          const row = pageData.find(r => String(r[idField] ?? '') === String(rowId));
          if (row) onExpand(row, container);
        });
      }
    }

    function applyFiltersAndSearch() {
      filteredData = allData.filter(row => {
        if (searchTerm && searchFields.length) {
          const searchLower = searchTerm.toLowerCase();
          const match = searchFields.some(f => {
            const v = typeof f === 'function' ? f(row) : row[f];
            return String(v || '').toLowerCase().includes(searchLower);
          });
          if (!match) return false;
        }
        for (const [key, fn] of Object.entries(filters)) {
          if (fn && !fn(row)) return false;
        }
        return true;
      });

      const sortCols = [];
      if (groupByColumn && columns.some(c => c.sortKey === groupByColumn)) sortCols.push({ key: groupByColumn, asc: sortColumn === groupByColumn ? sortAsc : true });
      if (sortColumn && columns.some(c => c.sortKey === sortColumn) && sortColumn !== groupByColumn) sortCols.push({ key: sortColumn, asc: sortAsc });
      sortCols.reverse().forEach(({ key: colKey, asc }) => {
        const col = columns.find(c => c.sortKey === colKey);
        const getVal = col && col.value ? (r) => col.value(r) : (r) => r[colKey];
        filteredData.sort((a, b) => {
          const av = getVal(a);
          const bv = getVal(b);
          const cmp = (av == null && bv == null) ? 0 : (av == null ? 1 : (bv == null ? -1 : (typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv), undefined, { numeric: true }))));
          return asc ? cmp : -cmp;
        });
      });
      currentPage = 0;
    }

    function handleSort(key) {
      if (sortColumn === key) sortAsc = !sortAsc;
      else sortAsc = true;
      sortColumn = key;
      applyFiltersAndSearch();
      render();
    }

    return {
      setData(newData) {
        allData = [...newData];
        applyFiltersAndSearch();
        render();
      },
      setSearch(term) {
        searchTerm = term;
        applyFiltersAndSearch();
        render();
      },
      setFilter(key, fn) {
        filters[key] = fn;
        applyFiltersAndSearch();
        render();
      },
      setSort(column, asc) {
        sortColumn = column;
        sortAsc = asc;
        applyFiltersAndSearch();
        render();
      },
      setGroupBy(column) {
        groupByColumn = column || null;
        expandedGroups.clear();
        knownGroupKeys.clear();
        applyFiltersAndSearch();
        render();
      },
      render,
      getElement: () => tableEl,
      getFilteredData: () => filteredData
    };
  }

  return { createTable };
})();
