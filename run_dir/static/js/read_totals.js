// Used by read_totals.html

// Component definition - can be imported and used in other Vue apps
const vReadsTotalComponent = {
    name: 'v-reads-total-component',
    props: ['query'],
    data() {
        return {
            Q30_THRESHOLD_DICT: {
                'HiSeq X': { 'default': 75.0 },
                'MiSeq': { '250': 60.0, '150': 70.0, '100': 75.0, 'default': 80.0 },
                'default': { '250': 60.0, '150': 75.0, '100': 80.0, 'default': 85.0 }
            },
            readsData: {},
            isHiseqX: false,
            expectedMinYieldPerSample: null,
            expectedMinYieldFormulaMode: null,
            showFlowcellSelection: false,
            bulkSelectedFlowcells: {},
            highlightedSample: null,
            checkedState: {},
            expandedSamples: {},
            sortKey: 'sample',
            sortDirection: 'asc',
            chartInstance: null,
            loading: true,
            error: null,
        };
    },
    
    computed: {
        hasData() {
            return this.sampleNames.length > 0;
        },
        sampleNames() {
            return Object.keys(this.readsData).filter(k => Array.isArray(this.readsData[k]));
        },
        summaryRows() {
            return this.sampleNames.map(sample => {
                let checkedReads = 0, uncheckedReads = 0, q30WeightedSum = 0, q30WeightTotal = 0;
                const rows = this.readsData[sample];
                rows.forEach(d => {
                    const count = Number.parseInt(d.cl, 10) || 0;
                    if (this.checkedState[this.selectionKey(sample, d.fcp)]) {
                        checkedReads += count;
                        const q30 = parseFloat(d.q30);
                        if (!Number.isNaN(q30)) {
                            q30WeightedSum += q30 * count;
                            q30WeightTotal += count;
                        }
                    } else {
                        uncheckedReads += count;
                    }
                });
                const avgQ30 = q30WeightTotal > 0 ? q30WeightedSum / q30WeightTotal : null;
                const firstRow = rows.find(d => d.run_mode != null) || rows[0];
                const threshold = firstRow ? this.getRowThreshold(firstRow) : 85.0;
                const libQc = firstRow && Object.prototype.hasOwnProperty.call(firstRow, 'lib_qc')
                    ? firstRow.lib_qc
                    : '-';
                return { sample, checkedReads, uncheckedReads, avgQ30, threshold, libQc };
            });
        },
        summaryRowMap() {
            const map = {};
            this.summaryRows.forEach(r => { map[r.sample] = r.checkedReads; });
            return map;
        },
        summaryRowQ30Map() {
            const map = {};
            this.summaryRows.forEach(r => { map[r.sample] = r.avgQ30; });
            return map;
        },
        summaryRowLibQcMap() {
            const map = {};
            this.summaryRows.forEach(r => { map[r.sample] = r.libQc; });
            return map;
        },
        sortedSampleNames() {
            const direction = this.sortDirection === 'asc' ? 1 : -1;
            return [...this.sampleNames].sort((leftSample, rightSample) => {
                let leftValue;
                let rightValue;

                if (this.sortKey === 'reads') {
                    leftValue = this.summaryRowMap[leftSample] || 0;
                    rightValue = this.summaryRowMap[rightSample] || 0;
                } else if (this.sortKey === 'flowcells') {
                    leftValue = this.sampleFlowcellCount(leftSample);
                    rightValue = this.sampleFlowcellCount(rightSample);
                } else if (this.sortKey === 'libQc') {
                    const libQcOrder = { Pass: 2, Fail: 1, '-': 0 };
                    leftValue = libQcOrder[this.sampleLibQcLabel(leftSample)] ?? -1;
                    rightValue = libQcOrder[this.sampleLibQcLabel(rightSample)] ?? -1;
                } else if (this.sortKey === 'q30') {
                    leftValue = this.summaryRowQ30Map[leftSample] ?? -1;
                    rightValue = this.summaryRowQ30Map[rightSample] ?? -1;
                } else {
                    leftValue = leftSample;
                    rightValue = rightSample;
                }

                if (leftValue < rightValue) return -1 * direction;
                if (leftValue > rightValue) return 1 * direction;
                return leftSample.localeCompare(rightSample);
            });
        },
        allFlowcellIds() {
            const ids = new Set();
            this.sampleNames.forEach(sample => {
                (this.readsData[sample] || []).forEach(d => {
                    ids.add(d.fcp);
                });
            });
            return Array.from(ids).sort();
        },
        selectedFlowcellIds() {
            return this.allFlowcellIds.filter(id => this.bulkSelectedFlowcells[id]);
        },
        selectedFlowcellIdSet() {
            return new Set(this.selectedFlowcellIds);
        },
        bulkAffectedRowsCount() {
            const selectedSet = this.selectedFlowcellIdSet;
            let count = 0;
            if (selectedSet.size === 0) return 0;
            this.sampleNames.forEach(sample => {
                (this.readsData[sample] || []).forEach(d => {
                    if (selectedSet.has(d.fcp)) count += 1;
                });
            });
            return count;
        },
        bulkAffectedSamplesCount() {
            const selectedSet = this.selectedFlowcellIdSet;
            if (selectedSet.size === 0) return 0;
            return this.sampleNames.filter(sample => {
                return (this.readsData[sample] || []).some(d => selectedSet.has(d.fcp));
            }).length;
        },
        totalClusters() {
            return this.summaryRows.reduce((sum, r) => sum + r.checkedReads, 0);
        },
        isAllSelected() {
            const keys = Object.keys(this.checkedState);
            if (keys.length === 0) return false;
            return keys.every(key => this.checkedState[key]);
        },
        areAllSamplesExpanded() {
            if (this.sampleNames.length === 0) return false;
            return this.sampleNames.every(sample => this.expandedSamples[sample]);
        },
        passedLibQcSamples() {
            return this.sampleNames.filter(sample => this.sampleLibQcLabel(sample) === 'Pass');
        },
        failedLibQcSamples() {
            return this.sampleNames.filter(sample => this.sampleLibQcLabel(sample) === 'Fail');
        },
        countLabel() {
            return this.isHiseqX ? 'Clusters' : 'Reads';
        },
        formattedExpectedMinYieldPerSample() {
            if (this.expectedMinYieldPerSample === null || Number.isNaN(Number(this.expectedMinYieldPerSample))) {
                return null;
            }
            const value = Number(this.expectedMinYieldPerSample);
            const abs = Math.abs(value);
            if (abs >= 1_000_000_000) {
                return `${(value / 1_000_000_000).toFixed(2)}B`;
            }
            if (abs >= 1_000_000) {
                return `${(value / 1_000_000).toFixed(2)}M`;
            }
            if (abs >= 1_000) {
                return `${(value / 1_000).toFixed(2)}k`;
            }
            return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
        },
        expectedMinYieldFormulaText() {
            if (this.expectedMinYieldFormulaMode === 'lanes') {
                return 'ordered lanes × lane threshold × 0.9 / number of project samples × 0.75.';
            }
            return 'ordered units × 600M × 0.9 / number of project samples × 0.75.';
        },
    },
    
    watch: {
        summaryRows() {
            this.$nextTick(() => this.renderChart());
        }
    },
    
    mounted() {
        if (this.query) {
            // Query was passed as prop, fetch data
            this.fetchData();
        }
    },
    
    methods: {
        fetchData() {
            axios.get(`/api/v1/read_totals/${this.query}`)
                .then(response => {
                    const data = response.data;
                    this.isHiseqX = data.isHiseqX || false;
                    this.expectedMinYieldPerSample = data.expectedMinYieldPerSample ?? null;
                    this.expectedMinYieldFormulaMode = data.expectedMinYieldFormulaMode ?? null;
                    delete data.isHiseqX;
                    delete data.expectedMinYieldPerSample;
                    delete data.expectedMinYieldFormulaMode;
                    this.readsData = data;
                    
                    // Initialize checkbox state
                    this.checkedState = {};
                    for (const [sample, rows] of Object.entries(this.readsData)) {
                        for (const d of rows) {
                            this.checkedState[`${sample}_${d.fcp}`] = true;
                        }
                    }
                    this.expandedSamples = {};
                    this.sampleNames.forEach(sample => {
                        this.expandedSamples[sample] = false;
                    });
                    this.bulkSelectedFlowcells = {};
                    this.allFlowcellIds.forEach(id => {
                        this.bulkSelectedFlowcells[id] = true;
                    });
                    this.showFlowcellSelection = false;
                    
                    this.loading = false;
                    this.$nextTick(() => this.renderChart());
                })
                .catch(error => {
                    console.error('Error fetching reads data:', error);
                    this.error = 'Failed to load data. Please try again.';
                    this.loading = false;
                });
        },
        
        getRowThreshold(d) {
            const run_mode = (d.run_mode === 'HiSeq X' || d.run_mode === 'MiSeq') ? d.run_mode : 'default';
            let run_setup = 'default';
            if (d.run_mode !== 'HiSeq X') {
                if (d.longer_read_length >= 250) run_setup = '250';
                else if (d.longer_read_length >= 150) run_setup = '150';
                else if (d.longer_read_length >= 100) run_setup = '100';
            }
            return this.Q30_THRESHOLD_DICT[run_mode][run_setup];
        },
        isRowInitiallyChecked(d) {
            return true;
        },
        q30Class(d) {
            if (d.fcp.includes('_UD')) return '';
            const threshold = this.getRowThreshold(d);
            if (d.q30 !== null && d.q30 !== undefined && parseFloat(d.q30) >= threshold) {
                return 'table-success';
            }
            return 'table-warning';
        },
        sampleQ30Class(sample) {
            const row = this.summaryRows.find(r => r.sample === sample);
            if (!row || row.avgQ30 === null) return '';
            if (row.avgQ30 >= row.threshold) {
                return 'table-success';
            }
            return 'table-warning';
        },
        sampleLibQcLabel(sample) {
            return this.normalizedLibQcLabel(this.summaryRowLibQcMap[sample]);
        },
        sampleLibQcBadgeClass(sample) {
            const label = this.sampleLibQcLabel(sample);
            if (label === 'Pass') {
                return 'badge bg-success rounded-pill';
            }
            if (label === 'Fail') {
                return 'badge bg-danger rounded-pill';
            }
            return 'badge bg-secondary rounded-pill';
        },
        normalizedLibQcLabel(value) {
            if (value === true || value === 'True' || value === 'true') {
                return 'Pass';
            }
            if (value === false || value === 'False' || value === 'false') {
                return 'Fail';
            }
            return '-';
        },
        sampleRows(sample) {
            return this.readsData[sample] || [];
        },
        selectionKey(sample, fcp) {
            return `${sample}_${fcp}`;
        },
        fcpFlowcellUrl(fcp) {
            const parts = fcp.split('_');
            const lastPart = parts[parts.length - 1].split(':')[0];
            return `/flowcells/${parts[0]}_${lastPart}`;
        },
        toggleAllSelection() {
            const nextValue = !this.isAllSelected;
            Object.keys(this.checkedState).forEach(key => {
                this.checkedState[key] = nextValue;
            });
        },
        highlightSample(sample) {
            this.highlightedSample = sample;
            this.expandedSamples[sample] = true;
            this.$nextTick(() => {
                const el = document.getElementById(sample);
                if (el) {
                    const fixedHeader = document.querySelector('nav.navbar.fixed-top');
                    const headerHeight = fixedHeader ? fixedHeader.getBoundingClientRect().height : 0;
                    const topGap = 12;
                    const scrollOffset = headerHeight + topGap;
                    const targetTop = el.getBoundingClientRect().top + window.pageYOffset - scrollOffset;
                    window.scrollTo({ top: Math.max(targetTop, 0), behavior: 'smooth' });
                    location.hash = '#' + sample;
                }
            });
        },
        toggleSampleExpanded(sample) {
            this.expandedSamples[sample] = !this.expandedSamples[sample];
        },
        isSampleChecked(sample) {
            const rows = this.sampleRows(sample);
            if (rows.length === 0) return false;
            return rows.every(d => this.checkedState[this.selectionKey(sample, d.fcp)]);
        },
        isSampleIndeterminate(sample) {
            const rows = this.sampleRows(sample);
            if (rows.length === 0) return false;
            const selectedCount = rows.filter(d => this.checkedState[this.selectionKey(sample, d.fcp)]).length;
            return selectedCount > 0 && selectedCount < rows.length;
        },
        onSampleCheckboxChange(sample, event) {
            const isChecked = event.target.checked;
            this.sampleRows(sample).forEach(d => {
                this.checkedState[this.selectionKey(sample, d.fcp)] = isChecked;
            });
        },
        areSamplesFullyChecked(samples) {
            if (samples.length === 0) return false;
            return samples.every(sample => this.isSampleChecked(sample));
        },
        toggleSamplesByLibQc(label) {
            const samples = label === 'Pass' ? this.passedLibQcSamples : this.failedLibQcSamples;
            const nextValue = !this.areSamplesFullyChecked(samples);
            samples.forEach(sample => {
                this.sampleRows(sample).forEach(d => {
                    this.checkedState[this.selectionKey(sample, d.fcp)] = nextValue;
                });
            });
        },
        formatQ30(value) {
            if (value === null || value === undefined) return '-';
            return Number(value).toFixed(2);
        },
        toggleFlowcellSelection() {
            this.showFlowcellSelection = !this.showFlowcellSelection;
        },
        applyBulkFlowcellSelection(isChecked) {
            const selectedSet = this.selectedFlowcellIdSet;
            if (selectedSet.size === 0) return;
            this.sampleNames.forEach(sample => {
                this.sampleRows(sample).forEach(d => {
                    if (selectedSet.has(d.fcp)) {
                        this.checkedState[this.selectionKey(sample, d.fcp)] = isChecked;
                    }
                });
            });
        },
        toggleAllSamplesExpanded() {
            const nextValue = !this.areAllSamplesExpanded;
            this.sampleNames.forEach(sample => {
                this.expandedSamples[sample] = nextValue;
            });
        },
        sampleFlowcellCount(sample) {
            return (this.readsData[sample] || []).length;
        },
        sampleSelectedCount(sample) {
            return (this.sampleRows(sample) || []).reduce((sum, d) => {
                if (!this.checkedState[this.selectionKey(sample, d.fcp)]) return sum;
                return sum + (Number.parseInt(d.cl, 10) || 0);
            }, 0);
        },
        selectSamplesBelowExpectedMinYield() {
            const threshold = Number(this.expectedMinYieldPerSample);
            if (Number.isNaN(threshold)) return;
            this.sampleNames.forEach(sample => {
                const shouldSelect = this.sampleSelectedCount(sample) < threshold;
                this.sampleRows(sample).forEach(d => {
                    if (!shouldSelect) {
                        this.checkedState[this.selectionKey(sample, d.fcp)] = false;
                    }
                });
            });
        },
        setSort(key) {
            if (this.sortKey === key) {
                this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
                return;
            }
            this.sortKey = key;
            this.sortDirection = key === 'sample' ? 'asc' : 'desc';
        },
        sortIndicator(key) {
            if (this.sortKey !== key) return '';
            return this.sortDirection === 'asc' ? 'asc' : 'desc';
        },
        downloadMainTableTSV() {
            const rows = ['Sample\tReads\tQ30'];
            this.sortedSampleNames.forEach(sample => {
                const selectedReads = this.summaryRowMap[sample] || 0;
                const avgQ30 = this.summaryRowQ30Map[sample];
                const q30Value = avgQ30 === null || avgQ30 === undefined ? '' : Number(avgQ30).toFixed(2);
                rows.push(`${sample}\t${selectedReads}\t${q30Value}`);
            });
            const blob = new Blob([rows.join('\n') + '\n'], { type: 'text/tab-separated-values;charset=utf-8' });
            saveAs(blob, `${this.query}_read_totals.tsv`);
        },
        buildChartSeriesData() {
            const seriesData = [
                { name: 'q30>threshold', data: [], color: '#78b560' },
                { name: 'q30&lt;threshold', data: [], color: '#e8cd4c' },
                { name: 'Not Selected',  data: [], color: '#dddddd' }
            ];
            this.summaryRows.forEach(r => {
                if (r.avgQ30 !== null && r.avgQ30 >= r.threshold) {
                    seriesData[0].data.push(r.checkedReads);
                    seriesData[1].data.push(0);
                } else {
                    seriesData[0].data.push(0);
                    seriesData[1].data.push(r.checkedReads);
                }
                seriesData[2].data.push(r.uncheckedReads);
            });
            return seriesData;
        },
        expectedMinYieldPlotLine() {
            if (this.expectedMinYieldPerSample === null) {
                return null;
            }
            return {
                id: 'expected-min-yield',
                color: '#fd0d0d',
                dashStyle: 'ShortDash',
                value: this.expectedMinYieldPerSample,
                width: 2,
                zIndex: 5,
                label: {
                    text: 'Expected minimum yield',
                    align: 'right',
                    style: { color: '#fd0d0d' }
                }
            };
        },
        renderChart() {
            if (!this.hasData) return;
            const sampleNames = this.summaryRows.map(r => r.sample);
            const seriesData = this.buildChartSeriesData();
            const plotLine = this.expectedMinYieldPlotLine();

            if (this.chartInstance) {
                this.chartInstance.xAxis[0].setCategories(sampleNames, false);
                this.chartInstance.yAxis[0].setTitle({ text: '# ' + this.countLabel }, false);
                this.chartInstance.yAxis[0].removePlotLine('expected-min-yield');
                if (plotLine) {
                    this.chartInstance.yAxis[0].addPlotLine(plotLine);
                }
                seriesData.forEach((series, index) => {
                    this.chartInstance.series[index].update({ name: series.name, color: series.color }, false);
                    this.chartInstance.series[index].setData(series.data, false);
                });
                this.chartInstance.redraw();
                return;
            }

            this.chartInstance = Highcharts.chart('read_totals_summary_chart', {
                credits: { enabled: false },
                chart: { type: 'column' },
                title: { text: 'Sample Read Counts' },
                subtitle: { text: 'Click a bar to see that sample' },
                xAxis: { categories: sampleNames },
                yAxis: {
                    min: 0,
                    title: { text: '# ' + this.countLabel },
                    reversedStacks: false,
                    plotLines: plotLine ? [plotLine] : []
                },
                plotOptions: {
                    column: { stacking: 'normal', borderWidth: 0, groupPadding: 0.1 },
                    series: {
                        cursor: 'pointer',
                        point: {
                            events: {
                                click: (e) => { this.highlightSample(e.point.category); }
                            }
                        }
                    }
                },
                series: seriesData
            });
        }
    },
    template: /*html*/`
        <div>
            <h1>Read Totals for <a :href="'/project/' + query" target="_blank" rel="noopener noreferrer" class="text-decoration-none">{{ query }}</a></h1>
        </div>

        <template v-if="loading && query">
            <div class="alert alert-info mt-3">
                <span>Loading data...</span>
            </div>
        </template>

        <template v-else-if="error">
            <div class="alert alert-danger mt-3">
                <h4>Error</h4>
                <p>{{ error }}</p>
                <p>Please reload the page and try again.</p>
            </div>
        </template>

        <template v-else-if="query === ''">
            <h3 class="mt-3">Read totals are now project-scoped.</h3>
            <p>Open this view from a project page to load read totals for that project.</p>
        </template>

        <template v-else-if="hasData">
            <div>
                <div id="read_totals_summary_chart"></div>
                <p v-if="expectedMinYieldPerSample !== null" class="text-muted small mb-3">
                    Expected minimum yield per sample:
                    <strong
                        :title="'Formula: ' + expectedMinYieldFormulaText"
                        style="text-decoration: underline dotted; cursor: help;"
                    >{{ formattedExpectedMinYieldPerSample }}</strong>.
                </p>
                <div class="btn-group mb-3" role="group">
                    <input type="button" class="btn btn-outline-secondary" :value="isAllSelected ? 'Uncheck all' : 'Check all'" @click="toggleAllSelection"/>
                    <input type="button" class="btn btn-outline-secondary" :value="areAllSamplesExpanded ? 'Collapse all' : 'Expand all'" @click="toggleAllSamplesExpanded"/>
                    <input type="button" class="btn btn-outline-secondary" :value="showFlowcellSelection ? 'Hide flowcell selection' : 'Select flowcells'" @click="toggleFlowcellSelection"/>
                    <input type="button" class="btn btn-outline-secondary" value="Download main table as TSV" @click="downloadMainTableTSV"/>
                </div>
                <div class="d-flex flex-wrap gap-2 mb-3">
                    <button
                        type="button"
                        class="btn btn-sm btn-outline-success rounded-pill"
                        :disabled="passedLibQcSamples.length === 0"
                        @click="toggleSamplesByLibQc('Pass')"
                    >
                        {{ areSamplesFullyChecked(passedLibQcSamples) ? 'Uncheck' : 'Check' }} Pass QC samples
                    </button>
                    <button
                        type="button"
                        class="btn btn-sm btn-outline-danger rounded-pill"
                        :disabled="failedLibQcSamples.length === 0"
                        @click="toggleSamplesByLibQc('Fail')"
                    >
                        {{ areSamplesFullyChecked(failedLibQcSamples) ? 'Uncheck' : 'Check' }} Fail QC samples
                    </button>
                    <button
                        type="button"
                        class="btn btn-sm btn-outline-warning rounded-pill"
                        :disabled="expectedMinYieldPerSample === null"
                        @click="selectSamplesBelowExpectedMinYield"
                    >
                        Check all samples below yield threshold
                    </button>
                </div>
                <div v-if="showFlowcellSelection" class="card mb-3">
                    <div class="card-body">
                        <p class="mb-2">
                            Select one or more flowcells below, then apply the change across all samples.
                        </p>

                        <div style="max-height: 220px; overflow: auto; border: 1px solid #d9d9d9; border-radius: 4px; padding: 8px;">
                            <div v-for="id in allFlowcellIds" :key="id" class="form-check">
                                <input class="form-check-input" type="checkbox" :id="'bulk_' + id" v-model="bulkSelectedFlowcells[id]"/>
                                <label class="form-check-label" :for="'bulk_' + id">{{ id }}</label>
                            </div>
                        </div>

                        <div class="d-flex gap-2 mt-3">
                            <input type="button" class="btn btn-primary" value="Check selected IDs across all samples" :disabled="selectedFlowcellIds.length === 0" @click="applyBulkFlowcellSelection(true)"/>
                            <input type="button" class="btn btn-outline-primary" value="Uncheck selected IDs across all samples" :disabled="selectedFlowcellIds.length === 0" @click="applyBulkFlowcellSelection(false)"/>
                        </div>
                    </div>
                </div>
                <div class="container-fluid table-responsive mt-4">
                    <table class="table table-striped table-bordered align-middle reads_table mb-0">
                        <thead>
                            <tr class="darkth">
                                <th style="position: sticky; top: 0; z-index: 2;">Include</th>
                                <th style="position: sticky; top: 0; z-index: 2; cursor: pointer;" @click="setSort('sample')">Sample <i v-if="sortIndicator('sample')" :class="sortIndicator('sample') === 'asc' ? 'fa-sharp fa-solid fa-sort-up ms-1' : 'fa-sharp fa-solid fa-sort-down ms-1'"></i></th>
                                <th style="position: sticky; top: 0; z-index: 2; cursor: pointer;" @click="setSort('libQc')">Lib. QC <i v-if="sortIndicator('libQc')" :class="sortIndicator('libQc') === 'asc' ? 'fa-sharp fa-solid fa-sort-up ms-1' : 'fa-sharp fa-solid fa-sort-down ms-1'"></i></th>
                                <th class="text-end" style="position: sticky; top: 0; z-index: 2; font-variant-numeric: tabular-nums; cursor: pointer;" @click="setSort('flowcells')">Flowcells <i v-if="sortIndicator('flowcells')" :class="sortIndicator('flowcells') === 'asc' ? 'fa-sharp fa-solid fa-sort-up ms-1' : 'fa-sharp fa-solid fa-sort-down ms-1'"></i></th>
                                <th class="text-end" style="position: sticky; top: 0; z-index: 2; font-variant-numeric: tabular-nums; cursor: pointer;" @click="setSort('reads')">{{ countLabel }} (selected) <i v-if="sortIndicator('reads')" :class="sortIndicator('reads') === 'asc' ? 'fa-sharp fa-solid fa-sort-up ms-1' : 'fa-sharp fa-solid fa-sort-down ms-1'"></i></th>
                                <th class="text-end" style="position: sticky; top: 0; z-index: 2; font-variant-numeric: tabular-nums; cursor: pointer;" @click="setSort('q30')">Average % > q30 (selected) <i v-if="sortIndicator('q30')" :class="sortIndicator('q30') === 'asc' ? 'fa-sharp fa-solid fa-sort-up ms-1' : 'fa-sharp fa-solid fa-sort-down ms-1'"></i></th>
                            </tr>
                        </thead>
                        <tbody>
                            <template v-for="sample in sortedSampleNames" :key="sample">
                                <tr :id="sample" class="sample_table"
                                    :class="{ highlighted: highlightedSample === sample, 'table-secondary': !isSampleChecked(sample), 'text-muted': !isSampleChecked(sample) }"
                                    style="cursor: pointer; transition: background-color 0.15s ease;"
                                    @click="toggleSampleExpanded(sample)">
                                    <td>
                                        <input
                                            type="checkbox"
                                            :checked="isSampleChecked(sample)"
                                            :indeterminate.prop="isSampleIndeterminate(sample)"
                                            @click.stop
                                            @change="onSampleCheckboxChange(sample, $event)"
                                        />
                                    </td>
                                    <td>
                                        <span class="me-2" style="display: inline-block; font-size: 1.1rem; transition: transform 0.15s ease;" :style="{ transform: expandedSamples[sample] ? 'rotate(90deg)' : 'rotate(0deg)' }">▶</span>
                                        <span>{{ sample }}</span>
                                    </td>
                                    <td><span :class="sampleLibQcBadgeClass(sample)">{{ sampleLibQcLabel(sample) }}</span></td>
                                    <td class="text-end" style="font-variant-numeric: tabular-nums;">{{ sampleFlowcellCount(sample) }}</td>
                                    <td class="text-end" style="font-variant-numeric: tabular-nums;">{{ summaryRowMap[sample].toLocaleString() }}</td>
                                    <td class="text-end" :class="sampleQ30Class(sample)" style="font-variant-numeric: tabular-nums;">{{ formatQ30(summaryRowQ30Map[sample]) }}</td>
                                </tr>
                                <tr v-if="expandedSamples[sample]">
                                    <td colspan="6" style="padding: 0 0 10px 30px;">
                                        <table class="table table-sm table-hover table-striped mb-0 align-middle">
                                            <thead>
                                                <tr class="darkth">
                                                    <th>Include</th>
                                                    <th>Flowcell:Lane</th>
                                                    <th class="text-end" style="font-variant-numeric: tabular-nums;">{{ countLabel }}</th>
                                                    <th class="text-end" style="font-variant-numeric: tabular-nums;">% > q30</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr v-for="d in sampleRows(sample)" :key="d.fcp" :class="{ 'table-secondary': !checkedState[selectionKey(sample, d.fcp)], 'text-muted': !checkedState[selectionKey(sample, d.fcp)] }">
                                                    <td><input type="checkbox" v-model="checkedState[selectionKey(sample, d.fcp)]"/></td>
                                                    <td><a :class="{ 'text-decoration-none': true, 'text-muted': !checkedState[selectionKey(sample, d.fcp)] }" :href="fcpFlowcellUrl(d.fcp)">{{ d.fcp }}</a></td>
                                                    <td class="text-end" style="font-variant-numeric: tabular-nums;">{{ Number(d.cl).toLocaleString() }}</td>
                                                    <td class="text-end" :class="q30Class(d)" style="font-variant-numeric: tabular-nums;">{{ d.q30 }}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </td>
                                </tr>
                            </template>
                        </tbody>
                        <tfoot>
                            <tr class="darkth">
                                <th></th>
                                <th></th>
                                <th></th>
                                <th class="text-end">Total selected</th>
                                <th class="text-end" style="font-variant-numeric: tabular-nums;">{{ totalClusters.toLocaleString() }}</th>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        </template>

        <template v-else>
            <div class="alert alert-danger mt-3">
                <h4>Error - No samples found</h4>
                <p>Sorry, we weren't able to find any samples for <code>{{ query }}</code>.</p>
            </div>
        </template>
    `
};

  const app = Vue.createApp({
    components: { 'v-reads-total-component': vReadsTotalComponent },
    data() {
      return { query: "{{ query }}" };
    }
  });
    app.mount('#read_totals_app');
