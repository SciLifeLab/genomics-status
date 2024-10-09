import {vProjectCards, vProjectDataField, vProjectDetails} from './projects_components.js'
import { getDropdownPosition } from './smart_suggestion.js';
import { vRunningNotesTab, vRunningNoteSingle } from './running_notes_component.js'


const vProjectsStatus = {
    data() {
        return {
            /* Common data */
            project_details: {},
            project_samples: {},
            sticky_running_notes: {},
            running_notes: {},
            error_messages: [],
            websocket_message:'',
            websocket: null,
            /* Used for tagging running notes. */
            all_users: [],
            current_user: '',
            /* Used to determine behaviour of the app depending on if it's a single project or multiple projects */
            single_project_mode: false,
            /* Only used on project cards page */
            all_projects: {},
            sortBy: 'status',
            card_columns: ['library_construction_method'],
            descending: true,
            search_value: '',
            open_modal_card: null,
            // Filters
            all_filters: {
                'application': {
                    'title': 'Application',
                    'key': 'application',
                    'secondary_key': null,
                    'filter_values': [],
                    'include_all': true
                },
                'lab_responsible': {
                    'title': 'Lab Responsible',
                    'key': 'lab_responsible',
                    'secondary_key': null,
                    'filter_values': [],
                    'include_all': true
                },
                'library_construction_method': {
                    'title': 'Library Construction Method',
                    'key': 'library_construction_method',
                    'secondary_key': null,
                    'filter_values': [],
                    'include_all': true
                },
                'status': {
                    'title': 'Status',
                    'key': 'status',
                    'secondary_key': 'status_fields',
                    'filter_values': [],
                    'include_all': true
                },
                'type': {
                    'title': 'Type',
                    'key': 'type',
                    'secondary_key': null,
                    'filter_values': [],
                    'include_all': true
                },
                'project_coordinator': {
                    'title': 'Project Coordinator',
                    'key': 'project_coordinator',
                    'secondary_key': null,
                    'filter_values': [],
                    'include_all': true
                }
            }
        }
    },
    computed: {
        /* Only used on project cards page*/
        visibleProjects() {
            /* Filters and sorts the projects */
            if (Object.keys(this.all_projects).length == 0) {
                // No need to filter if there are no projects
                return this.all_projects
            }

            let tempProjects = Object.entries(this.all_projects)

            // Filter on all filters
            for (let filter in this.all_filters) {
                let filter_values = this.all_filters[filter]['filter_values']
                let include_all = this.all_filters[filter]['include_all']

                if (include_all == false) {
                    tempProjects = tempProjects.filter(([project_id, project]) => {
                        let key = this.all_filters[filter]['key']
                        let secondary_key = this.all_filters[filter]['secondary_key']
                        let project_value = null

                        // Allowing nested keys up to a depth of 2
                        if (secondary_key == null) {
                            project_value = project[key]
                        } else {
                            project_value = project[secondary_key][key]
                        }

                        // Special case for undefined
                        if (filter_values.includes('undefined')) {
                            if (project_value == undefined) {
                                return true
                            }
                        }
                        return filter_values.includes(project_value)
                    })
                }
            }

            // Search filter
            if (this.search_value != '' && this.search_value) {
                tempProjects = tempProjects.filter(([project_id, project]) => {
                    return JSON.stringify(project)
                    .toUpperCase()
                    .includes(this.search_value.toUpperCase())
                })
            }

            if (this.sortBy == 'most_recent_date') {
                tempProjects = this.sortOnMostRecentDate(tempProjects)
            } else if (this.sortBy == 'project_id') {
                // Sort on project_id
                tempProjects = tempProjects.sort((a, b) => {
                    if (a[0] > b[0]) {
                        return 1
                    } else if (a[0] < b[0]) {
                        return -1
                    }
                    return 0
                })
            } else if (this.sortBy == 'status') {
                // Sort on status
                tempProjects = tempProjects.sort((a, b) => {
                    let proj_a = this.all_projects[a[0]]
                    let proj_b = this.all_projects[b[0]]
                    if (proj_a['status_fields']['status'] > proj_b['status_fields']['status']) {
                        return 1
                    } else if (proj_a['status_fields']['status'] < proj_b['status_fields']['status']) {
                        return -1
                    }
                    return 0
                })
            }

            if (this.descending == true) {
                tempProjects = tempProjects.reverse()
            }

            return Object.fromEntries(tempProjects)
        },
        allColumnValues() {
            /* Returns a dictionary with card column as key and the project_ids as values */
            let columnValues = {}
            for (let project_id in this.visibleProjects) {
                let project = this.visibleProjects[project_id]
                let columnValue;
                if (this.card_columns.length == 2) {
                    columnValue = project[this.card_columns[0]][this.card_columns[1]]
                } else {
                    columnValue = project[this.card_columns[0]]
                }
                if (columnValue in columnValues) {
                    columnValues[columnValue].push(project_id)
                } else {
                    columnValues[columnValue] = [project_id]
                }
            }
            return columnValues
        },
        currentActiveFilters() {
            // List the currently active filters for display purposes
            let activeFilters = {}
            for (let filter_key in this.all_filters) {
                let filter_values = this.all_filters[filter_key]['filter_values']
                let include_all = this.all_filters[filter_key]['include_all']
                // We might need to handle an edge case where the filter_values are empty
                if (include_all == false) {
                    for (let value of filter_values) {
                        // Check if filter is added to the activeFilters
                        if (activeFilters[filter_key] == undefined) {
                            activeFilters[filter_key] = [value]
                        } else {
                            activeFilters[filter_key].push([value])
                        }
                    }
                }
            }
            return activeFilters
        },
        sorting_icon() {
            if (this.descending) {
                return 'fa-arrow-down-wide-short'
            } else {
                return 'fa-arrow-up-wide-short '
            }
        }
    },
    methods: {
        fetchProjectDetails(project_id) {
            axios
                .get(`/api/v1/project_summary/${project_id}?view_with_sources=True`)
                .then(response => {
                    if (response.data !== null) {
                        this.project_details[project_id] = response.data;
                    }
                })
                .catch(error => {
                    this.error_messages.push('Error fetching project details for project ' + project_id + '. Please try again or contact a system administrator.');
                    console.log(error);
                });
            axios
                .get(`/api/v1/project/${project_id}`)
                .then(response => {
                    if (response.data !== null) {
                        this.project_samples[project_id] = response.data;
                    }
                })
                .catch(error => {
                    this.error_messages.push('Error fetching sample details for project ' + project_id + '. Please try again or contact a system administrator.');
                    console.log(error);
                });
            this.fetchStickyRunningNotes(project_id);
        },
        async fetchStickyRunningNotes(project_id) {
            let post_body;
            if (project_id !== undefined) {
                post_body = {project_ids: [project_id]};
            } else {
                post_body = {project_ids: Object.keys(this.all_projects)};
            }
            const sleep = (delay) => new Promise((resolve) => setTimeout(resolve,delay))

            if (Object.keys(this.all_projects).length === 0){
                // Wait for projects to be fetched even though the request should already have returned
                await sleep(1000);
            }
            axios
                .post('/api/v1/latest_sticky_run_note', post_body)
                .then(response => {
                    let data = response.data
                    if (data !== null) {
                        this.sticky_running_notes = Object.assign({}, this.sticky_running_notes, data);
                    }
                })
                .catch(error => {
                    this.error_messages.push('Unable to fetch sticky running notes, please try again or contact a system administrator.')
                })
        },
        setupWebsocket() {
            /* This is still a proof of concept */
            // Taken from https://stackoverflow.com/a/10418013
            let loc = window.location, new_uri;
            if (loc.protocol === "https:") {
                new_uri = "wss:";
            } else {
                new_uri = "ws:";
            }
            new_uri += "//" + loc.host;
            new_uri += "/api/v1/project_websocket";
            this.websocket = new WebSocket(new_uri);

            this.websocket.onmessage = (event) => {
                console.log(event.data);
                this.websocket_message = event.data;
            };
        },
        /* Only used on project cards page */
        fetchProjects() {
            axios
                .get('/api/v1/projects?list=pending,reception_control,review,ongoing&type=All')
                .then(response => {
                    let data = response.data
                    if (data !== null) {
                        this.all_projects = data
                    }
                    this.fetchStickyRunningNotes()
                })
                .catch(error => {
                    console.log(error)
                    this.error_messages.push('Unable to fetch projects, please try again or contact a system administrator.')
                })
        },
        fetchAllUsers() {
            axios
                .get('/api/v1/user_management/users')
                .then(response => {
                    let data = response.data
                    if (data !== null) {
                        this.all_users = Object.keys(data)
                            .map(email=>{
                                return email.split('@')[0]
                            })
                    }
                })
                .catch(error => {
                    console.log(error)
                    this.error_messages.push('Unable to fetch users, please try again or contact a system administrator.')
                })
        },
        // Helper methods
        allValues(filter_name){
            return this.itemCounts(this.all_projects, filter_name)
        },
        allVisibleValues(filter_name){
            return this.itemCounts(this.visibleProjects, filter_name)
        },
        getDropdownPositionHelper(input, dropdownHeight) {
            return getDropdownPosition(input, dropdownHeight)
        },
        itemCounts(list, filter_name) {
            /* 
                Returns a dictionary with the counts of each unique item in the list 
                key is either a string with a key or an array with two keys
            */
            let items = []
            let filter_key = this.all_filters[filter_name]['key']
            let secondary_key = this.all_filters[filter_name]['secondary_key']

            if (Object.keys(list).length == 0) {
                return {}
            }

            for (let item in list) {
                if (secondary_key != null) {
                    items.push(list[item][secondary_key][filter_key])
                } else {
                    items.push(list[item][filter_key])
                }
            }

            let counts = {}
            for (let item of items) {
                if (item in counts) {
                    counts[item] += 1
                } else {
                    counts[item] = 1
                }
            }
            // Convert the itemCounts object to an array of [key, value] pairs
            let sortedCounts = Object.entries(counts);

            // Sort the array by the keys (i.e., the first element of each pair)
            sortedCounts.sort((a, b) => a[0].localeCompare(b[0]));

            // Convert the array back to an object
            counts = Object.fromEntries(sortedCounts);
            return counts
        },
        mostRecentDate(project) {
            let mostRecentKeyArray = this.mostRecentDateArray(project)
            return mostRecentKeyArray[1]
        },
        mostRecentDateArray(project) {
            if ('summary_dates' in project == false) {
                return []
            };
            let summaryDates = project['summary_dates'];
            if (Object.keys(summaryDates).length == 0) {
                return []
            };

            let mostRecentKey = Object.keys(summaryDates).reduce((a, b) => summaryDates[a] > summaryDates[b] ? a : b);
            return [mostRecentKey, summaryDates[mostRecentKey]]
        },
        nrVisibleWith(filter_name, filter_value){
            if (filter_value in this.allVisibleValues(filter_name)) {
                return this.allVisibleValues(filter_name)[filter_value]
            } else {
                return 0
            }
        },
        projectTypeColor(project) {
            let type = project['type']
            if (type == 'Application') {
                return 'success'
            } else if (type == 'Production') {
                return 'primary'
            } else if (type == 'Facility') {
                return 'info'
            } else if (type == 'Single-Cell') {
                return 'warning'
            } else {
                return 'secondary'
            }
        },
        projectStatusColor(project) {
            let status = project['status_fields']['status']
            if (status == 'Pending') {
                return 'secondary'
            } else if (status == 'Reception Control') {
                return 'info'
            } else if (status == 'Ongoing') {
                return 'primary'
            }
            return 'warning'
        },
        sortOnMostRecentDate(projects_to_be_sorted) {
            // Sort by most recent date            
            projects_to_be_sorted = projects_to_be_sorted.sort((a, b) => {
                let proj_a = this.all_projects[a[0]]
                let proj_b = this.all_projects[b[0]]

                if (this.sortBy == 'most_recent_date') {
                    /* First deal with missing dates */
                    if ((this.mostRecentDate(proj_a) == undefined) && (this.mostRecentDate(proj_b) == undefined)) {
                        return 0
                    }
                    if (this.mostRecentDate(proj_a) == undefined) {
                        // Missing dates will be the most recent
                        return 1
                    } else if (this.mostRecentDate(proj_b) == undefined){
                        return -1
                    }
                    /* Then deal with actual dates */
                    if (this.mostRecentDate(proj_a) > this.mostRecentDate(proj_b)) {
                        return 1
                    } else if (this.mostRecentDate(proj_a) < this.mostRecentDate(proj_b)) {
                        return -1
                    }
                    return 0
                };
            })
            return projects_to_be_sorted
        },
        toggleSorting() {
            this.descending = !this.descending
        }
    }
}

const app = Vue.createApp(vProjectsStatus)
app.component('v-project-data-field-tooltip', vProjectDataField)
app.component('v-projects-cards', vProjectCards)
app.component('v-project-details', vProjectDetails)
app.component('v-running-note-single', vRunningNoteSingle)
app.component('v-running-notes-tab', vRunningNotesTab)
app.mount('#v_projects_main')