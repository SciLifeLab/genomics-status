import { vPricingQuote } from './pricing_quote_components.js'
import { vPricingMain } from './pricing_main_components.js'

export const vProjectDataField = {
    name: 'v-project-data-field-tooltip',
    // A single dt field with a dd field
    props: ['field_name', 'project_data'],
    computed: {
        field_source() {
            if (this.project_data['field_sources'] == undefined) {
                return ''
            }
            return this.project_data['field_sources'][this.field_name]
        },
        data_value() {
            if (this.field_name in this.project_data) {
                return this.project_data[this.field_name]
            } else {
                return '-' // Missing value
            }
        }
    },
    mounted: function() {
        // Init bootstrap tooltip
        this.$nextTick(function () {
            this.tooltip = new bootstrap.Tooltip(this.$el);
        })
    },
    template:
    /*html*/`
        <span data-toggle="tooltip" data-html="true" data-placement="right" :title="field_source">{{data_value}}</span>
    `
}

export const vProjectDetails = {
    name: 'v-project-details',
    // The single_project_mode is to be used when only a single project is used for the app
    // and the project cards are not shown
    props: ['project_id', 'as_modal', 'single_project_mode', 'user'],
    data: function() {
        return {
            active_tab: 'project-running-notes-pane',
            show_link_form: false,
            proj_links: [],
            link_error: '',
            visible_info_ids: [],
            new_link_type: '',
            new_link_name: '',
            pricing_app: null,
            modal_opened: false
        }
    },
    computed: {
        can_delete_project_folder_links() {
            return (this.user.roles.includes('admin') || this.user.roles.includes('proj_coord'))
        },
        project_data() {
            return this.$root.project_details[this.project_id]
        },
        project_data_exists() {
            return this.project_data != undefined
        },
        project_samples() {
            return this.$root.project_samples[this.project_id]
        },
        project_comment() {
            if (this.project_data['project_comment'] == undefined) {
                return ''
            }
            return marked.parse(this.project_data['project_comment'])
        },
        status_bg_class() {
            if (this.project_data['status'] == 'Aborted') {
                return 'bg-danger'
            } else if (this.project_data['status'] == 'Closed') {
                return 'bg-success'
            } else if (this.project_data['status'] == 'Ongoing') {
                return 'bg-info'
            } else if (this.project_data['status'] == 'Reception Control') {
                return 'bg-warning'
            } else if (this.project_data['status'] == 'Pending') {
                return 'bg-secondary'
            }
        }
    },
    watch: {
        new_link_type(newVal, oldVal) {
            if (newVal === 'project_folder') {
                this.new_link_name = 'Project Folder';
            }
            else if (newVal !== 'project_folder' && this.new_link_name === 'Project Folder') {
                this.new_link_name = '';
            }
        }
    },
    methods: {
        switchTab(tab_name) {
            // Check if disabled
            if (this.$refs[tab_name].classList.contains('disabled')) {
                return
            }

            // deactivate old tab
            this.$refs[this.active_tab].classList.remove('show', 'active');
            this.$refs[this.active_tab + '-btn'].classList.remove('active');

            // Activate new tab
            this.$refs[tab_name].classList.add('show', 'active');
            this.$refs[tab_name + '-btn'].classList.add('active');
            this.active_tab = tab_name;
            if(tab_name == 'project-agreements-pane'){
                this.mount_pricing_app();
            }
        },
        pressEnter(event) {
            // Check if typing in input
            if ((event.target.tagName === 'INPUT') || (event.target.tagName === 'TEXTAREA')) {
                return
            }
            // Open new running note form
            if (this.active_tab == 'project-running-notes-pane') {
                this.$refs['project-running-notes-pane-component'].toggleNewNoteForm()
            }
        },
        copy_to_clipboard(event, text) {
            // Copy text to clipboard
            navigator.clipboard.writeText(text).then(function() {
                // Show a tooltip
                let tooltip = new bootstrap.Tooltip(event.target, {
                    title: 'Copied!',
                    trigger: 'manual'
                });
                tooltip.show();
                setTimeout(() => {
                    tooltip.hide();
                }, 1000)
            }, function(err) {
                console.error('Async: Could not copy text: ', err);
            });
        },
        copy_orderportal_title(event) {
            this.copy_to_clipboard(event, this.project_data['customer_project_reference'])
        },
        showLinkForm() {
            this.show_link_form = !this.show_link_form;
            this.new_link = '';
            this.new_link_name = '';
            this.new_link_desc = '';
            this.new_link_type = '';
        },
        addLink() {
            if (this.new_link.trim() == '' || this.new_link_name.trim() == '') {
                this.link_error = 'URL and title are required';
                return
            }
            // Add link
            axios.post('/api/v1/links/' + this.project_id, new URLSearchParams({
                url: this.new_link,
                title: this.new_link_name,
                desc: this.new_link_desc,
                type: this.new_link_type
            })).then((response) => {
                this.$root.fetchProjectDetails(this.project_id);
                this.show_link_form = false;
                this.new_link = '';
                this.new_link_name = '';
                this.new_link_desc = '';
                this.new_link_type = '';
            }).catch((error) => {
                console.log('Error in adding a link:', error);
                this.link_error = error.response ? error.response.statusText : 'An error occurred';
            });
        },
        confirmDelete(link_id) {
            if (window.confirm("Are you sure you want to delete this link?")) {
                this.deleteLink(link_id);
            }
        },
        deleteLink(link_id) {
            axios.delete('/api/v1/links/' + this.project_id, {
                data: { link_id: link_id }
            }).then((response) => {
                this.$root.fetchProjectDetails(this.project_id);
            }).catch((error) => {
                console.log('Error in deleting a link:', error);
            });
        },
        toggleInfo(link_id) {
            if (this.visible_info_ids.includes(link_id)) {
                this.visible_info_ids = this.visible_info_ids.filter(i => i !== link_id);
            } else {
                this.visible_info_ids.push(link_id);
            }
        },
        isVisibleInfo(link_id) {
            return this.visible_info_ids.includes(link_id)
        },
        mount_pricing_app() {
            if(!this.pricing_app){
                this.pricing_app = Vue.createApp(vPricingMain);
                this.pricing_app.config.globalProperties.Origin = "Agreement" ;
                this.pricing_app.config.globalProperties.is_proj_coord = this.user.roles.includes("proj_coord");
                this.pricing_app.config.globalProperties.project_id=this.project_id;
                this.pricing_app.component('v-pricing-quote', vPricingQuote);
                this.pricing_app.mount(this.$refs.pricing_quote_main);
            }
        },
        unmount_pricing_app() {
            if(this.pricing_app){
                this.pricing_app.unmount();
                this.pricing_app = null;
            }
        }
    },
    created: function() {
        if (this.single_project_mode && !this.$root.single_project_mode) {
            // Enable single project mode on app level
            this.$root.single_project_mode = true;
        }
        if (this.$root.single_project_mode) {
            this.$root.fetchProjectDetails(this.project_id);
            this.$root.fetchAllUsers();
            this.modal_opened = true;  // Set to true for single project mode
        }
    },
    mounted: function() {
        document.addEventListener('keyup', this.handleKeyUpDetails);
    },
    emits: ['closeModal'],
    template: 
    /*html*/`
        <template v-if="project_data_exists">
            <div class="row">
                <div class="col-12">
                    <div :class="{ 'modal-header border-bottom-0 pb-0': as_modal}">
                        <h1 :class="{ 'modal-title': as_modal, 'col': true }" id="projectDetailsModalLabel" style="white-space: nowrap;">
                            {{project_id}}, {{project_data.project_name}}
                            <small class="text-muted ml-4">
                            NGI Portal: <a class="text-decoration-none text-wrap" :href="'https://ngisweden.scilifelab.se/orders/order/' + project_data['portal_id']" target="_blank">{{project_data['customer_project_reference']}}</a><a class="ml-2" target="_blank" @click="copy_orderportal_title" style="cursor: pointer;"><i class="fa-regular fa-copy"></i></a>
                            </small>
                        </h1>
                        <template v-if="as_modal">
                            <button type="button" class="btn-close" @click="$emit('closeModal')"></button>
                        </template>
                    </div>
                    <div class="row">
                        <h3 :class="{'mt-3': true, 'ml-3': as_modal, 'col-auto': true}">
                            <a :href="'/project/' + project_id" class="text-decoration-none"  style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis" target="_blank">
                                <i class="fa-regular fa-arrow-up-right-from-square"></i> Old Project Page
                            </a>
                        </h3>
                        <v-project-people-assignments :project_id="project_id" :as_modal="as_modal" :in_card="false"></v-project-people-assignments>
                    </div>
                    <h2><span :class="'badge w-100 mt-1 mb-4 ' + status_bg_class">{{project_data.status}}</span></h2>
                </div>
                <div class="col-4">
                    <h4>Library preparation
                    <template v-if="user.roles.includes('admin') || user.roles.includes('proj_coord')">
                        <a :href="'/project_creation_edit/' + project_id" id="project_info_edit_button" class="btn btn-secondary btn-xs" target="_blank">Edit Project Info</a>
                    </template>
                    </h4>
                    <dl class="dl-horizontal">
                        <div class="dt-dd-pair">
                            <dt>Sample units ordered:</dt>
                            <dd>
                                <v-project-data-field-tooltip :field_name="'sample_units_ordered'" :project_data="project_data" :data_value="project_data['sample_units_ordered']"></v-project-data-field-tooltip>
                            </dd>
                        </div>
                        <div class="dt-dd-pair">
                        <dt>Sample type:</dt>
                        <dd>
                            <v-project-data-field-tooltip :field_name="'sample_type'" :project_data="project_data" :data_value="project_data['sample_type']"></v-project-data-field-tooltip>
                        </dd>
                        </div>
                        <div class="dt-dd-pair">
                            <dt>Library construction method:</dt>
                            <dd>
                                <v-project-data-field-tooltip :field_name="'library_construction_method'" :project_data="project_data" :data_value="project_data['library_construction_method']"></v-project-data-field-tooltip>
                            </dd>
                        </div>
                        <div class="dt-dd-pair">
                            <dt>Library prep option:</dt>
                            <dd>
                                <v-project-data-field-tooltip :field_name="'library_prep_option'" :project_data="project_data" :data_value="project_data['library_prep_option']"></v-project-data-field-tooltip>
                            </dd>
                        </div>
                        <div class="dt-dd-pair">
                            <dt>Library type (ready-made libraries):</dt>
                            <dd>
                                <v-project-data-field-tooltip :field_name="'library_type_(ready-made_libraries)'" :project_data="project_data" :data_value="project_data['library_type_(ready-made_libraries)']"></v-project-data-field-tooltip>
                            </dd>
                        </div>
                        <div class="dt-dd-pair">
                            <dt>Number of lanes ordered:</dt>
                            <dd>
                                <v-project-data-field-tooltip :field_name="'sequence_units_ordered_(lanes)'" :project_data="project_data" :data_value="project_data['sequence_units_ordered_(lanes)']"></v-project-data-field-tooltip>
                            </dd>
                        </div>
                    </dl>
                    <h4>Sequencing</h4>
                    <dl class="dl-horizontal">
                        <div class="dt-dd-pair">
                            <dt>Number of lanes ordered:</dt>
                            <dd>
                                <v-project-data-field-tooltip :field_name="'sequence_units_ordered_(lanes)'" :project_data="project_data" :data_value="project_data['sequence_units_ordered_(lanes)']"></v-project-data-field-tooltip>
                            </dd>
                        </div>
                        <div class="dt-dd-pair">
                            <dt>Sequencing platform:</dt>
                            <dd>
                                <v-project-data-field-tooltip :field_name="'sequencing_platform'" :project_data="project_data" :data_value="project_data['sequencing_platform']"></v-project-data-field-tooltip>
                            </dd>
                        </div>
                        <div class="dt-dd-pair">
                            <dt>Flowcell:</dt>
                            <dd>
                                <v-project-data-field-tooltip :field_name="'flowcell'" :project_data="project_data" :data_value="project_data['flowcell']"></v-project-data-field-tooltip>
                            </dd>
                        </div>
                        <div class="dt-dd-pair">
                            <dt>Flowcell option:</dt>
                            <dd>
                                <v-project-data-field-tooltip :field_name="'flowcell_option'" :project_data="project_data" :data_value="project_data['flowcell_option']"></v-project-data-field-tooltip>
                            </dd>
                        </div>
                        <div class="dt-dd-pair">
                            <dt>Sequencing setup:</dt>
                            <dd>
                                <v-project-data-field-tooltip :field_name="'sequencing_setup'" :project_data="project_data" :data_value="project_data['sequencing_setup']"></v-project-data-field-tooltip>
                            </dd>
                        </div>
                        <div class="dt-dd-pair">
                            <dt>Custom primer:</dt>
                            <dd>
                                <v-project-data-field-tooltip :field_name="'custom_primer'" :project_data="project_data" :data_value="project_data['custom_primer']"></v-project-data-field-tooltip>
                            </dd>
                        </div>
                        <div class="dt-dd-pair">
                            <dt>Low diversity:</dt>
                            <dd>
                                <v-project-data-field-tooltip :field_name="'low_diversity'" :project_data="project_data" :data_value="project_data['low_diversity']"></v-project-data-field-tooltip>
                            </dd>
                        </div>
                        <div class="dt-dd-pair">
                            <dt>PhiX %:</dt>
                            <dd>
                                <v-project-data-field-tooltip :field_name="'phix_percentage'" :project_data="project_data" :data_value="project_data['phix_percentage']"></v-project-data-field-tooltip>
                            </dd>
                        </div>
                    </dl>
                    </div>
                    <div class="col-4">
                        <h4>Bioinformatics</h4>
                        <dl class="dl-horizontal">
                            <div class="dt-dd-pair">
                                <dt>Reference genome</dt>
                                <dd>
                                    <v-project-data-field-tooltip :field_name="'reference_genome'" :project_data="project_data" :data_value="project_data['reference_genome']"></v-project-data-field-tooltip>
                                </dd>
                            </div>
                            <div class="dt-dd-pair">
                                <dt>Organism</dt>
                                <dd>
                                    <v-project-data-field-tooltip :field_name="'organism'" :project_data="project_data" :data_value="project_data['organism']"></v-project-data-field-tooltip>
                                </dd>
                            </div>
                            <div class="dt-dd-pair">
                                <dt>Best practice analysis</dt>
                                <dd>
                                    <v-project-data-field-tooltip :field_name="'best_practice_bioinformatics'" :project_data="project_data" :data_value="project_data['best_practice_bioinformatics']"></v-project-data-field-tooltip>
                                </dd>
                            </div>
                        </dl>
                    <h4>Links
                        <button class="btn btn-sm btn-outline-primary" @click.prevent="showLinkForm">
                            <template v-if="show_link_form">
                                <i class="fa-solid fa-minus"></i>
                            </template>
                            <template v-else>
                                <i class="fa-solid fa-plus"></i>
                            </template>
                        </button>
                    </h4>
                    <div :class="{'col-9': !this.as_modal}">
                        <form ref="new_note_form" @submit.prevent="addLink">
                            <div class="row mb-5 ml-0" v-show="show_link_form">
                                <div class="form-floating col-5 mb-2 pl-0">
                                    <select id="new_link_type" class="form-select" v-model="new_link_type">
                                        <option value="project_folder">Project Folder</option>
                                        <option value="deviation">Deviation</option>
                                        <option value="other">Other</option>
                                    </select>
                                    <label for="new_link_type">Type</label>
                                </div>
                                <input type="text" class="form-control" v-model="new_link" placeholder="URL: https://docs.google.com/example">
                                <input type="text" class="form-control mt-2" v-model="new_link_name" placeholder="Title">
                                <textarea class="form-control mt-2" v-model="new_link_desc" placeholder="Description"></textarea>
                                <button class="btn btn btn-primary mt-2 mr-1 col-3" type="submit">Add</button>
                                <button class="btn btn btn-secondary mt-2 col-3" @click.prevent="showLinkForm">Cancel</button>
                                <div class="mt-2" v-if="link_error">
                                    <span class="text-danger">{{link_error}}</span>
                                </div>
                            </div>
                        </form>
                    </div>
                    <div class="row mr-2">
                        <div :class="{'col-9': !this.as_modal}">
                            <div class="rounded-3">
                                <h3 class="row mb-0" v-if="project_data['portal_id'] !== undefined">
                                    <button class="btn btn-large badge text-primary border col-11" style="padding: 0.85rem !important;">
                                        <a :href="'https://ngisweden.scilifelab.se/orders/order/' + project_data['portal_id']" class="row text-decoration-none d-inline">
                                            <span class="col-11 float-left text-left">Order Portal</span>
                                            <i class="col-1 fa-sharp fa-regular fa-clipboard-list-check float-right px-0"></i>
                                        </a>
                                    </button>
                                </h3>
                            </div>
                            <template v-if="project_data.links">
                                <template v-for="link_type in ['project_folder', 'deviation', 'other']">
                                    <template v-for="(link, link_id) in project_data.links[link_type]">
                                        <div class="mt-1 pt-1 rounded-3">
                                            <h3 class="row mb-0">
                                                <button class="btn btn-large badge text-primary border col-11" :href="link.url" style="padding: 0.85rem !important;">
                                                    <a :href="link.url" target="_blank" class="text-decoration-none row d-inline">
                                                            <span class="col-6 float-left text-wrap text-left">{{link.title}}</span>
                                                            <span class="col-5 fs-6 fw-lighter text-wrap pr-0">{{link.user}}</span>
                                                            <template v-if="link.type.toLowerCase()=='other'">
                                                                <i class="fa fa-solid fa-link float-right text-primary col-1 px-0">
                                                            </template>
                                                            <template v-if="link.type=='project_folder'">
                                                                <i class="fa-solid fa-folder-open float-right text-primary col-1 px-0">
                                                            </template>
                                                            <template v-if="link.type.toLowerCase()=='deviation'">
                                                                <i class="fa fa-exclamation-circle float-right text-danger col-1 px-0">
                                                            </template>
                                                            <span v-if="isVisibleInfo(link_id)" class="text-muted text-start d-flex justify-content-start fs-6 mt-2 mb-1">{{link.desc}}</span>
                                                    </a>
                                                </button>
                                                <div class="col-1 d-flex align-items-center p-1">
                                                    <i role="button" class="fa-regular fa-circle-info fa-xs pr-1" @click.prevent="toggleInfo(link_id)" title="Show link description"></i>
                                                    <i v-if="(link_type=='project_folder' && can_delete_project_folder_links) || link_type!='project_folder'" role="button" class="far fa-times-square fa-xs text-danger" aria-hidden="true" @click="confirmDelete(link_id)" title="Delete link"></i>
                                                </div>
                                            </h3>
                                        </div>
                                    </template>
                                </template>
                            </template>
                            <div class="mt-1 pt-1 rounded-3">
                                <h3 class="row mb-0">
                                    <button class="btn btn-large badge text-primary border col-11" :href="'/read_totals/' + project_id" style="padding: 0.85rem !important;">
                                        <a :href="'/read_totals/' + project_id" target="_blank" rel="noopener noreferrer" class="text-decoration-none row d-inline">
                                            <span class="col-6 float-left text-left">Read totals</span>
                                            <i class="fa-solid fa-chart-column float-right text-primary col-1 px-0"></i>
                                        </a>
                                    </button>
                                </h3>
                            </div>
                            <div v-if="'reports' in project_data && 'project_summary' in project_data.reports" class="mt-1 pt-1 rounded-3">
                                <h3 class="row mb-0">
                                    <button class="btn btn-large badge text-primary border col-11" :href="'/proj_summary_report/'+project_id" style="padding: 0.85rem !important;">
                                        <a :href="'/proj_summary_report/'+project_id" target="_blank" class="text-decoration-none row d-inline">
                                            <span class="col-6 float-left text-left">Project Summary</span>
                                            <i class="fa-regular fa-clipboard-list-check float-right text-primary col-1 px-0"></i>
                                        </a>
                                    </button>
                                </h3>
                            </div>
                            <div v-if="'reports' in project_data && 'multiqc' in project_data.reports" class="dropright row">
                                <a class="btn btn-lg border dropdown-toggle mt-1 col-11" style="padding: 0.85rem !important;" href="#" role="button" data-toggle="dropdown" id="mqc_dropdown">
                                    <img class="col-4" src="https://github.com/MultiQC/MultiQC/raw/main/docs/images/MultiQC_logo.png#gh-light-mode-only" alt="MultiQC" style="height: 1em; width: auto">
                                </a>
                                <div class="dropdown-menu" aria-labelledby="mqc_dropdown" style="width: 50%">
                                    <template v-for="(report_url, report_name) in project_data.reports['multiqc']">
                                        <a :href="report_url" class="dropdown-item" target="_blank">
                                            <span class="col float-left">{{report_name}}</span>
                                        </a>
                                    </template>
                                </div>
                            </div>
                            <div v-if="'reports' in project_data && 'sample_summary_reports' in project_data.reports" class="dropright row">
                                <a class="btn btn-lg border dropdown-toggle mt-1 col-11" href="#" role="button" data-toggle="dropdown" id="sample_reports_dropdown">
                                    <i class="fa-regular fa-vial"></i> Sample reports
                                </a>
                                <div class="dropdown-menu" aria-labelledby="sample_reports_dropdown" style="width: 50%">
                                    <template v-for="(values, sample) in project_data.reports['sample_summary_reports']" :key="sample">
                                        <template v-for="(report, method) in values" :key="method">
                                            <a :href="'/singlecell_sample_summary_report/'+project_id+'/'+sample+'/'+report" class="dropdown-item" target="_blank">
                                                <span class="col float-left">{{sample}} {{method}}</span>
                                            </a>
                                        </template>
                                    </template>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-4">
                    <h4>Project comment</h4>
                    <p v-html="project_comment"></p>
                    <h4>Latest sticky note</h4>
                    <template v-if="project_id in this.$root.sticky_running_notes">
                        <v-running-note-single :running_note_obj="this.$root.sticky_running_notes[project_id]" :sticky="true" :compact="true"></v-running-note-single>
                    </template>
                    <template v-else>
                        <p>-</p>
                    </template>

                </div>
            </div>
            <div class="row mt-5">
                <h2>Status</h2>
                <div class="col-4">
                    <h4>Reception Control</h4>
                    <dl class="dl-horizontal">
                        <div class="dt-dd-pair">
                            <dt>Number of sample units ordered</dt> 
                            <dd>
                                <v-project-data-field-tooltip :field_name="'sample_units_ordered'" :project_data="project_data" :data_value="project_data.sample_units_ordered"></v-project-data-field-tooltip>
                            </dd>
                        </div>
                        <div class="dt-dd-pair">
                            <dt>Number of samples imported</dt>
                            <dd>
                                <v-project-data-field-tooltip :field_name="'no_samples'" :project_data="project_data" :data_value="project_data.no_samples"></v-project-data-field-tooltip>
                            </dd>
                        </div>
                        <div class="dt-dd-pair">
                            <dt>Failed samples</dt>                        
                            <dd>
                                <v-project-data-field-tooltip :field_name="'failed_samples'" :project_data="project_data" :data_value="project_data.failed_samples"></v-project-data-field-tooltip>
                            </dd>
                        </div>
                        <div class="dt-dd-pair">
                            <dt>Passed samples</dt>           
                            <dd>
                                <v-project-data-field-tooltip :field_name="'passed_initial_qc'" :project_data="project_data" :data_value="project_data.passed_initial_qc"></v-project-data-field-tooltip>
                            </dd>
                        </div>
                        <div class="dt-dd-pair">
                            <dt>Open date</dt>
                            <dd>
                                <v-project-data-field-tooltip :field_name="'open_date'" :project_data="project_data" :data_value="project_data.open_date"></v-project-data-field-tooltip>
                            </dd>
                        </div>
                        <div class="dt-dd-pair">
                            <dt>QC start date</dt>
                            <dd>
                                <v-project-data-field-tooltip :field_name="'first_initial_qc_start_date'" :project_data="project_data" :data_value="project_data.first_initial_qc_start_date"></v-project-data-field-tooltip>
                            </dd>
                        </div>
                    </dl>
                </div>
                <div class="col-4">
                    <h4>Library QC</h4>
                    <dl class="dl-horizontal">
                        <div class="dt-dd-pair">
                            <dt>Number of samples in progress</dt>
                            <dd>
                                <v-project-data-field-tooltip :field_name="'in_progress'" :project_data="project_data" :data_value="project_data.in_progress"></v-project-data-field-tooltip>
                            </dd>
                        </div>
                        <div class="dt-dd-pair">
                            <dt>Passed samples</dt>
                            <dd>
                                <v-project-data-field-tooltip :field_name="'passed_library_qc'" :project_data="project_data" :data_value="project_data.passed_library_qc"></v-project-data-field-tooltip>
                            </dd>
                        </div>
                        <div class="dt-dd-pair">
                            <dt>Queue date</dt>
                            <dd>
                                <v-project-data-field-tooltip :field_name="'queued'" :project_data="project_data" :data_value="project_data.queued"></v-project-data-field-tooltip>
                            </dd>
                        </div>
                        <div class="dt-dd-pair">
                            <dt>Library prep start</dt>
                            <dd>
                                <v-project-data-field-tooltip :field_name="'library_prep_start'" :project_data="project_data" :data_value="project_data.library_prep_start"></v-project-data-field-tooltip>
                            </dd>
                        </div>
                        <div class="dt-dd-pair">
                            <dt>Library QC finished</dt>
                            <dd>
                                <v-project-data-field-tooltip :field_name="'qc_library_finished'" :project_data="project_data" :data_value="project_data.qc_library_finished"></v-project-data-field-tooltip>
                            </dd>
                        </div>
                    </dl>
                </div>
                <div class="col-4">
                    <h4>Sequencing and Bioinformatics</h4>
                    <dl class="dl-horizontal">
                        <div class="dt-dd-pair">                        
                            <dt>Number of lanes ordered</dt>  
                            <dd>
                                <v-project-data-field-tooltip :field_name="'sequence_units_ordered_(lanes)'" :project_data="project_data" :data_value="project_data['sequence_units_ordered_(lanes)']"></v-project-data-field-tooltip>    
                            </dd>
                        </div>
                        <div class="dt-dd-pair">
                            <dt>Number of lanes sequenced</dt> 
                            <dd>
                                <v-project-data-field-tooltip :field_name="'lanes_sequenced'" :project_data="project_data" :data_value="project_data.lanes_sequenced"></v-project-data-field-tooltip>
                            </dd>
                        </div>
                        <div class="dt-dd-pair">
                            <dt>Sequencing start</dt>
                            <dd>
                                <v-project-data-field-tooltip :field_name="'sequencing_start_date'" :project_data="project_data" :data_value="project_data.sequencing_start_date"></v-project-data-field-tooltip>
                            </dd>
                        </div>
                        <div class="dt-dd-pair">
                            <dt>All samples sequenced</dt>
                            <dd>
                                <v-project-data-field-tooltip :field_name="'all_samples_sequenced'" :project_data="project_data" :data_value="project_data.all_samples_sequenced"></v-project-data-field-tooltip>
                            </dd>
                        </div>
                        <div class="dt-dd-pair">
                            <dt>All raw data delivered</dt>
                            <dd>
                                <v-project-data-field-tooltip :field_name="'all_raw_data_delivered'" :project_data="project_data" :data_value="project_data.all_raw_data_delivered"></v-project-data-field-tooltip>
                            </dd>
                        </div>
                        <div class="dt-dd-pair">
                            <dt>Analysis completed</dt>
                            <dd>
                                <v-project-data-field-tooltip :field_name="'best_practice_analysis_completed'" :project_data="project_data" :data_value="project_data.best_practice_analysis_completed"></v-project-data-field-tooltip>
                            </dd>
                        </div>
                        <div class="dt-dd-pair">
                            <dt>Close date</dt>
                            <dd>
                                <v-project-data-field-tooltip :field_name="'close_date'" :project_data="project_data" :data_value="project_data.close_date"></v-project-data-field-tooltip>
                            </dd>
                        </div>
                    </dl>
                </div>
                <!-- TABS -->
                <div>
                    <ul class="nav nav-tabs" id="myTab" role="tablist">
                        <li class="nav-item" role="presentation">
                            <button class="nav-link active" ref="project-running-notes-pane-btn" @click="switchTab('project-running-notes-pane')" type="button" role="tab" aria-controls="project-running-notes-pane" aria-selected="true">Running Notes</button>
                        </li>
                        <li class="nav-item" role="presentation">
                            <button class="nav-link" ref="project-details-pane-btn" @click="switchTab('project-details-pane')" type="button" role="tab" aria-controls="project-details-pane" aria-selected="false">Project information</button>
                        </li>
                        <li class="nav-item" role="presentation">
                            <button class="nav-link" ref="project-samples-pane-btn" @click="switchTab('project-samples-pane')" type="button" role="tab" aria-controls="project-samples-pane" aria-selected="false">Samples</button>
                        </li>
                        <li class="nav-item" role="presentation">
                            <button class="nav-link" ref="project-user-communication-pane-btn" @click="switchTab('project-user-communication-pane')" type="button" role="tab" aria-controls="project-user-communication-pane" aria-selected="false">User communication</button>
                        </li>
                        <li class="nav-item" role="presentation">
                            <button class="nav-link" ref="project-agreements-pane-btn" @click="switchTab('project-agreements-pane')" type="button" role="tab" aria-controls="project-agreements-pane" aria-selected="false">Agreements</button>
                        </li>
                    </ul>
                    <div class="tab-content" id="myTabContent">
                        <div class="tab-pane fade show active" ref="project-running-notes-pane" role="tabpanel" aria-labelledby="project-running-notes-pane-btn" tabindex="0">
                            <v-running-notes-tab ref="project-running-notes-pane-component" v-if="modal_opened && $root.current_user && Object.keys($root.all_users || {}).length > 0" :partition_id="project_id" note_type="project" :all_users_parent="$root.all_users" :current_user="user || $root.current_user"></v-running-notes-tab>
                        </div>
                        <div class="tab-pane fade" ref="project-details-pane" role="tabpanel" aria-labelledby="project-details-pane-btn" tabindex="0"><h1 class="mt-4"><i class="fa-light fa-triangle-person-digging mr-2"></i>Under construction</h1></div>
                        <div class="tab-pane fade" ref="project-samples-pane" role="tabpanel" aria-labelledby="project-samples-pane-btn" tabindex="0"><h1 class="mt-4"><i class="fa-light fa-triangle-person-digging mr-2"></i>Under construction</h1></div>
                        <div class="tab-pane fade" ref="project-user-communication-pane" role="tabpanel" aria-labelledby="project-user-communication-pane-btn" tabindex="0"><h1 class="mt-4"><i class="fa-light fa-triangle-person-digging mr-2"></i>Under construction</h1></div>
                        <div class="tab-pane fade" ref="project-agreements-pane" role="tabpanel" aria-labelledby="project-agreements-pane-btn" tabindex="0">
                            <div class="container-fluid mt-3" ref="pricing_quote_main"></div>
                        </div>
                    </div>
                </div>

            </div>
        </template>
    `,
}

export const vProjectCard = {
    props: ['project_id', 'next_project_id', 'previous_project_id', 'user'],  
    data: function() {
        return {
            modal: null
        }
    },
    computed: {
        hasSummaryDates() {
            return ('summary_dates' in this.project) && (Object.keys(this.project['summary_dates']).length > 0)
        },
        project() {
            return this.$root.project_details[this.project_id]
        },
        project_name() {
            if ('project_name' in this.project) {
                return this.project['project_name']
            }
            return ''
        }
    },
    methods: {
        closeModal() {
            return new Promise((resolve, reject) => {
                // Remove modal-open class from body
                this.$root.open_modal_card = this;
                this.$refs.project_details_component.unmount_pricing_app();
                this.$refs.project_details_component.modal_opened = false;

                $(this.$el).on('hidden.bs.modal', function (e) {
                    resolve();
                });

                this.modal.hide();
            });
        },
        openModal() {
            this.$root.fetchProjectDetails(this.project_id);
            this.$nextTick(function () {
                // Add modal-open class to body
                this.$root.open_modal_card = this;
                this.$refs.project_details_component.modal_opened = true;  // Set flag when opening
                this.$refs.project_details_component.switchTab('project-running-notes-pane');
                this.modal.show();
            })
        },
        pressEnter(event) {
            this.$refs.project_details_component.pressEnter(event);
        },
        handleModalHidden(event) {
            this.closeModal();
        }
    },
    mounted: function() {
        // Init bootstrap modal
        this.modal = new bootstrap.Modal(this.$refs.modal);
        this.$refs.modal.addEventListener('hidden.bs.modal', this.handleModalHidden);
    },
    template: 
    /*html*/`
    <div class="card my-2">
        <div class="card-body">
            <div class="d-flex justify-content-between align-center mb-3">
                <h5 class="my-1">
                    <a class="text-decoration-none" href='#' @click.prevent=openModal>
                        {{project_id }}, {{ project_name }}
                    </a>

                </h5>
                <div class="col">
                    <div class="d-flex justify-content-end">
                        <h5 class="my-1">
                            <span :class="'badge bg-' + this.$root.projectTypeColor(project)">{{ project['type'][0] }}</span>
                        </h5>
                    </div>
                </div>

            </div>
            <div class="row">
                <div class="">
                    <template v-if="project_id in this.$root.sticky_running_notes">
                        <v-running-note-single :running_note_obj="this.$root.sticky_running_notes[project_id]" :sticky="true" :compact="true"></v-running-note-single>
                    </template>
                </div>
            </div>
            <div class="row">
                <div class="col">
                    <div class="d-flex">
                        <h5>
                            <span :class="'badge bg-' + this.$root.projectStatusColor(project)">{{ project['status_fields']['status'] }}</span>
                        </h5>
                    </div>
                </div>
                <div class="col-auto ml-auto">
                    <h4>
                        <v-project-people-assignments :project_id="this.project_id" :as_modal="true" :in_card="true"></v-project-people-assignments>
                    </h4>
                </div>
            </div>
            <div>
                <!-- Modal -->
                <div class="modal" :id="'modal_' + project_id" tabindex="-1" ref="modal" :data-next-project-id="next_project_id" :data-previous-project-id="previous_project_id" aria-labelledby="exampleModalLabel" aria-hidden="true">
                    <div class="modal-dialog modal-xl">
                        <div class="modal-content">
                            <div class="modal-body">
                                <!-- This shows the project page -->
                                <v-project-details :project_id="project_id" ref="project_details_component" :user="this.user" :single_project_mode="false" :as_modal="true" @close-modal="closeModal"/>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" @click="closeModal">Close</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>`,
}

export const vProjectPeopleAssignments = {
    name: 'v-project-people-assignments',
    props: ['project_id', 'as_modal', 'in_card'],
    data: function() {
        return {
            people_menu_open: false,
            search_phrase: ''
        }
    },
    computed: {
        people() {
            if (this.project_id in this.$root.project_details) {
                if (this.$root.project_details[this.project_id]['people_assigned'] == undefined) {
                    return []
                }
                return this.$root.project_details[this.project_id]['people_assigned']
            }

            return []
        },
        matching_people() {
            let people_list = {} // New object to be returned
            for (let person_id in this.$root.all_users) {
                let person = this.$root.all_users[person_id]
                if (this.search_phrase == '') {
                    people_list[person_id] = person;
                } else if (person.name == undefined) {
                    continue
                } else if (person.name.toLowerCase().includes(this.search_phrase.toLowerCase())) {
                    people_list[person_id] = person
                }
            }

            let sorted_people_list = Object.entries(people_list)
                .sort(([, a], [, b]) => a.name.localeCompare(b.name))
                .reduce((acc, [key, value]) => {
                    acc[key] = value;
                    return acc;
                }, {});

                return sorted_people_list;
        }
    },
    methods: {
        initials(identifier) {
            if (this.$root.all_users[identifier] == undefined) {
                return identifier
            }
            if (this.$root.all_users[identifier]['initials'] != '') {
                return this.$root.all_users[identifier]['initials']
            } else {
                return identifier
            }
        },
        name(identifier) {
            if (this.$root.all_users[identifier]['name'] != '') {
                return this.$root.all_users[identifier]['name']
            } else {
                return identifier
            }
        },
        remove_from_project(person_id) {
            this.$root.removePersonFromProject(this.project_id, person_id)
        },
        add_to_project(person_id) {
            this.$root.addPersonToProject(this.project_id, person_id)
            this.search_phrase = ''
        },
        togglePeopleMenu(event) {
            if (this.people_menu_open) {
                this.people_menu_open = false;
            } else {
                this.people_menu_open = true;
            }
        },
    },
    template:
    /*html*/`
    <div class="col-auto ml-auto">
        <v-template v-if="in_card">
            <h4>
                <template v-for="person in people">
                    <span class="badge rounded-pill bg-success mr-1">
                        {{ initials(person) }}
                    </span>
                </template>
            </h4>
        </v-template>
        <v-template v-else>
            <v-template v-if="!people_menu_open">
                <h2>
                    <template v-for="person in people">
                        <span class="badge rounded-pill bg-success mr-1" @click="togglePeopleMenu">
                            {{ initials(person) }}
                        </span>
                    </template>
                    <button class="btn ml-2" @click="togglePeopleMenu"><i class="fa-solid fa-users mr-2"></i><i class="fa-solid fa-up-right-and-down-left-from-center"></i></button>
                </h2>
            </v-template>

            <template v-if="people_menu_open">
                <h3>
                    <template v-for="person_id in people">
                        <span class="badge rounded-pill bg-success mr-1">
                            {{ name(person_id) }}
                            <button type="button" class="btn btn-lg m-0" @click="remove_from_project(person_id)"><i class="fa-regular fa-trash-can text-white"></i></button>
                        </span>
                    </template>

                    <div class="btn-group">
                        <span class="badge rounded-pill bg-success mr-1">
                            <button type="button" class="btn btn-lg" id="dropdown_add_person" data-toggle="dropdown" aria-expanded="false">
                                <i class="fa-solid fa-plus text-white"></i>
                            </button>
                            <div :class="['dropdown-menu', {'dropdown-menu-right': !as_modal}]" aria-labelledby="dropdown_add_person">
                                <form class="px-3 py-3">
                                    <div class="form-group">
                                        <label for="addPeopleInput" class="form-label">Add People</label>
                                        <input type="text" class="form-control" id="addPeopleInput" placeholder="Search for person" v-model="this.search_phrase">
                                    </div>
                                    <div>
                                        <template v-for="person_id in Object.keys(this.matching_people)">
                                            <a class="dropdown-item" href="#" @click="add_to_project(person_id)">
                                                {{ this.matching_people[person_id]['name'] }}
                                            </a>
                                        </template>
                                    </div>
                                </form>
                            </div>
                        </span>
                    </div>
                    <button type="button" class="btn btn-close ml-1" aria-label="Close" @click="togglePeopleMenu"></button>
                </h3>
            </template>
        </template>
    </div>
    `
}

export const vProjectCards = {
    name: 'v-projects-cards',
    props: ['user'],
    components: {
        vProjectCard
    },
    data: function() {
        return {
            max_card_cols_height: 0,
            col_header_heights: {},
            max_col_header_height: 0
        }
    },
    computed: {
        checkedValuesCount() {
            return Object.keys(this.$root.all_filters).reduce((counts, key) => {
                counts[key] = this.$root.all_filters[key]['filter_values'].length;
                return counts;
            }, {});
        }
    },
    watch: {
        checkedValuesCount(newCounts) {
            Object.keys(newCounts).forEach(key => {
                if (newCounts[key] === 0) {
                    this.$root.all_filters[key]['include_all'] = true;
                }
            });
        },
        '$root.allColumnValues': {
            handler(newValue) {
              if (newValue) {
                this.$nextTick(() => {
                  this.calculateCardColsHeaderHeight();
                });
              }
            },
            immediate: true
          },
          "this.$root.card_columns": {
            handler(newValue) {
              if (newValue) {
                this.$nextTick(() => {
                  this.calculateCardColsHeaderHeight();
                });
              }
            },
            immediate: true
          }
    },
    methods: {
        selectFilterValue(event, filter_name, value) {
            /* A method to save a click on the 'All' switch when trying to filter */
            this.$root.all_filters[filter_name]['include_all'] = false
            if (event.target.tagName == 'DIV') {
                // Workaround since when the checkbox is disabled, the event target is the DIV and the input wouldn't be checked.
                // The normal case is handled by regular v-model.

                // Only add it once
                if (!this.$root.all_filters[filter_name]['filter_values'].includes(value)) {
                    this.$root.all_filters[filter_name]['filter_values'].push(value)
                }
            }
        },
        findNextDivWithClass(element, className) {
            while (element) {
                element = element.nextElementSibling;
                if (element && element.tagName === 'DIV' && element.classList.contains(className)) {
                    return element;
                }
            }
            return null;
        },
        changeModal(event, direction) {
            // Check if modal is open
            let open_modal = this.$root.open_modal_card;
            if (open_modal != null) {
                let next_modal_project_id = null

                if (direction == 'down') {
                // Find next div with class modal
                    next_modal_project_id = open_modal.next_project_id;
                } else if (direction == 'up') {
                    // Find previous div with class modal
                    next_modal_project_id = open_modal.previous_project_id;
                }

                if (next_modal_project_id != null) {
                    let ref_name = 'project_card_' + next_modal_project_id;
                    open_modal.closeModal().then(() => {
                        this.$refs[ref_name][0].openModal();
                    });
                }
            }
        },
        handleKeyUp(event) {
            // Check if typing in input
            if ((event.target.tagName === 'INPUT') || (event.target.tagName === 'TEXTAREA')) {
                return
            }
            if (event.key === 'j') {
                this.changeModal(event, 'down')
            } else if (event.key === 'k') {
                this.changeModal(event, 'up')
            } else if (event.key === 'Enter') {
                let open_modal = this.$root.open_modal_card;
                if (open_modal != null) {
                    open_modal.pressEnter(event)
                }
            }
        },
        person_assigned_name(identifier) {
            // check that it's not undefined
            if ((identifier in this.$root.all_users) && this.$root.all_users[identifier]['name'] != '') {
                return this.$root.all_users[identifier]['name']
            } 
             return identifier
        },
        removeFilter(event, filter_list_name, value) {
            let filter_values = this.$root.all_filters[filter_list_name]['filter_values']
            if (filter_values.includes(value)) {
                filter_values.splice(filter_values.indexOf(value), 1)
            }
            if (filter_values.length == 0) {
                this.$root.all_filters[filter_list_name]['include_all'] = true
            }
        },
        toggleCardFilterMenu(event) {
            let filter_menu = this.$refs.filter_menu;
            let filter_menu_caret = this.$refs.filter_menu_caret;

            // Remove the show class if it exists
            if (filter_menu.classList.contains('show')) {
                filter_menu.classList.remove('show');
                filter_menu_caret.classList.remove('fa-caret-down');
                filter_menu_caret.classList.add('fa-caret-right');
            } else {
                filter_menu.classList.add('show');
                filter_menu_caret.classList.remove('fa-caret-right');
                filter_menu_caret.classList.add('fa-caret-down');
            }
        },
        updateCardsMaxHeight() {
            const viewportHeight = window.innerHeight;
            //navbar and footer are on base.html and not in vue
            const navbarHeight = document.querySelector('.navbar').getBoundingClientRect().height;
            const footerHeight = document.querySelector('.footer').offsetHeight;

            const headerHeight =this.$refs.project_cards_header.offsetHeight;
            const offset = navbarHeight + footerHeight + headerHeight + 160; //160px for the margin
            this.max_card_cols_height = viewportHeight - offset;
          },
        calculateCardColsHeaderHeight() {
            let maxH = 0;
            // Loop through each h3 element ref
            Object.keys(this.$refs).forEach(ref => {
                // We are interested only in the h3 elements, so check for 'header' prefix
                if (ref.startsWith('header')) {
                    const header = this.$refs[ref];
                    if (header && header[0] && header[0].offsetHeight) {
                        this.col_header_heights[ref] = header[0].offsetHeight;
                        maxH = Math.max(maxH, header[0].offsetHeight); // Update maxH with the largest height
                    }
                }
            });
            // Set the maxHeight to the largest height found
            this.max_col_header_height = maxH;
        }
    },
    created: function() {
        this.$root.fetchProjects();
        this.$root.fetchAllUsers();
    },
    mounted: function() {
        document.addEventListener('keyup', this.handleKeyUp);
        this.updateCardsMaxHeight();
        window.addEventListener('resize', this.updateCardsMaxHeight);
    },
    beforeDestroy() {
      window.removeEventListener('resize', this.updateCardsMaxHeight);
    },
    template:
    /*html*/`
    <div class="mx-2">
        <div ref="project_cards_header">
            <h1>Project Cards</h1>
            <div class="card">
                <div class="card-header py-3" @click="toggleCardFilterMenu">
                    <h5 class="mb-0">
                        <i class="fa-solid fa-bars-filter"></i>
                        <i ref="filter_menu_caret" class="fas fa-caret-right fa-lg ml-3 pr-2"></i>
                        Filters
                    </h5>
                </div>
                <form ref="filter_menu" class="card-body collapse">
                    <div class="row row-cols-6">
                        <div class="col">
                            <h4>Status</h4>
                            <div class="form-check form-switch">
                                <input class="form-check-input" type="checkbox" role="switch" id="status_all_switch" v-model="this.$root.all_filters['status']['include_all']"/>
                                <label class="form-check-label" for="status_all_switch">All</label>
                            </div>
                            <template v-for="(nr_with_status, status) in this.$root.allValues('status')">
                                <div class="form-check" @click="(event) => selectFilterValue(event, 'status', status)">
                                    <input class="form-check-input" type="checkbox" :id="'status_filter_'+status" :value="status" v-model="this.$root.all_filters['status']['filter_values']" :disabled="this.$root.all_filters['status']['include_all']"/>
                                    <label class="form-check-label" :for="'status_filter_' + status">{{ status }} ({{this.$root.nrVisibleWith('status', status)}}/{{nr_with_status}})</label>
                                </div>
                            </template>
                        </div>
                        <div class="col">
                            <h4>Type</h4>
                            <div class="form-check form-switch">
                                <input class="form-check-input" type="checkbox" role="switch" id="type_all_switch" v-model="this.$root.all_filters['type']['include_all']"/>
                                <label class="form-check-label" for="type_all_switch">All</label>
                            </div>
                            <template v-for="(nr_with_type, type) in this.$root.allValues('type')">
                                <div class="form-check" @click="(event) => selectFilterValue(event, 'type', type)">
                                    <input class="form-check-input" type="checkbox" :id="'type_filter_'+type" :value="type" v-model="this.$root.all_filters['type']['filter_values']" :disabled="this.$root.all_filters['type']['include_all']"/>
                                    <label class="form-check-label" :for="'type_filter_' + type">{{ type }} ({{this.$root.nrVisibleWith('type', type)}}/{{nr_with_type}})</label>
                                </div>
                            </template>
                        </div>
                        <div class="col">
                            <h4>Project Coordinator</h4>
                            <div class="form-check form-switch">
                                <input class="form-check-input" type="checkbox" role="switch" id="project_coordinator_all_switch" v-model="this.$root.all_filters['project_coordinator']['include_all']"/>
                                <label class="form-check-label" for="project_coordinator_all_switch">All</label>
                            </div>
                            <template v-for="(nr_with_project_coordinator, project_coordinator) in this.$root.allValues('project_coordinator')">
                                <div class="form-check" @click="(event) => selectFilterValue(event, 'project_coordinator', project_coordinator)">
                                    <input class="form-check-input" type="checkbox" :id="'project_coordinator_filter_'+project_coordinator" :value="project_coordinator" v-model="this.$root.all_filters['project_coordinator']['filter_values']" :disabled="this.$root.all_filters['project_coordinator']['include_all']"/>
                                    <label class="form-check-label" :for="'project_coordinator_filter_' + project_coordinator">{{ project_coordinator }} ({{this.$root.nrVisibleWith('project_coordinator', project_coordinator)}}/{{nr_with_project_coordinator}})</label>
                                </div>
                            </template>
                        </div>
                        <div class="col">
                            <h4>Application</h4>
                            <div class="form-check form-switch">
                                <input class="form-check-input" type="checkbox" role="switch" id="application_all_switch" v-model="this.$root.all_filters['application']['include_all']"/>
                                <label class="form-check-label" for="application_all_switch">All</label>
                            </div>
                            <template v-for="(nr_with_application, application) in this.$root.allValues('application')">
                                <div class="form-check" @click="(event) => selectFilterValue(event, 'application', application)">
                                    <input class="form-check-input" type="checkbox" :id="'application_filter_'+application" :value="application" v-model="this.$root.all_filters['application']['filter_values']" :disabled="this.$root.all_filters['application']['include_all']"/>
                                    <label class="form-check-label" :for="'application_filter_' + application">{{ application }} ({{this.$root.nrVisibleWith('application', application)}}/{{nr_with_application}})</label>
                                </div>
                            </template>
                        </div>
                        <div class="col">
                            <h4>Library Construction Method</h4>
                            <div class="form-check form-switch">
                                <input class="form-check-input" type="checkbox" role="switch" id="library_construction_method_all_switch" v-model="this.$root.all_filters['library_construction_method']['include_all']"/>
                                <label class="form-check-label" for="library_construction_method_all_switch">All</label>
                            </div>
                            <template v-for="(nr_with_library_construction_method, library_construction_method) in this.$root.allValues('library_construction_method')">
                                <div class="form-check" @click="(event) => selectFilterValue(event, 'library_construction_method', library_construction_method)">
                                    <input class="form-check-input" type="checkbox" :id="'library_construction_method_filter_'+library_construction_method" :value="library_construction_method" v-model="this.$root.all_filters['library_construction_method']['filter_values']" :disabled="this.$root.all_filters['library_construction_method']['include_all']"/>
                                    <label class="form-check-label" :for="'library_construction_method_filter_' + library_construction_method">{{ library_construction_method }} ({{this.$root.nrVisibleWith('library_construction_method', library_construction_method)}}/{{nr_with_library_construction_method}})</label>
                                </div>
                            </template>
                        </div>
                        <div class="col">
                            <h4>Lab Responsible</h4>
                            <div class="form-check form-switch">
                                <input class="form-check-input" type="checkbox" role="switch" id="lab_responsible_all_switch" v-model="this.$root.all_filters['lab_responsible']['include_all']"/>
                                <label class="form-check-label" for="lab_responsible_all_switch">All</label>
                            </div>
                            <template v-for="(nr_with_lab_responsible, lab_responsible) in this.$root.allValues('lab_responsible')">
                                <div class="form-check" @click="(event) => selectFilterValue(event, 'lab_responsible', lab_responsible)">
                                    <input class="form-check-input" type="checkbox" :id="'lab_responsible_filter_'+lab_responsible" :value="lab_responsible" v-model="this.$root.all_filters['lab_responsible']['filter_values']" :disabled="this.$root.all_filters['lab_responsible']['include_all']"/>
                                    <label class="form-check-label" :for="'lab_responsible_filter_' + lab_responsible">{{ lab_responsible }} ({{this.$root.nrVisibleWith('lab_responsible', lab_responsible)}}/{{nr_with_lab_responsible}})</label>
                                </div>
                            </template>
                        </div>
                        <div class="col">
                            <h4>People Assigned</h4>
                            <div class="form-check form-switch">
                                <input class="form-check-input" type="checkbox" role="switch" id="people_assigned_all_switch" v-model="this.$root.all_filters['people_assigned']['include_all']"/>
                                <label class="form-check-label" for="people_assigned_all_switch">All</label>
                            </div>
                            <template v-for="(nr_with_person_assigned, person_assigned) in this.$root.allValues('people_assigned')">
                                <div class="form-check" @click="(event) => selectFilterValue(event, 'people_assigned', person_assigned)">
                                    <input class="form-check-input" type="checkbox" :id="'people_assigned_filter_'+person_assigned" :value="person_assigned" v-model="this.$root.all_filters['people_assigned']['filter_values']" :disabled="this.$root.all_filters['people_assigned']['include_all']"/>
                                    <label class="form-check-label" :for="'people_assigned_filter_' + person_assigned">{{ this.person_assigned_name(person_assigned) }} ({{this.$root.nrVisibleWith('people_assigned', person_assigned)}}/{{nr_with_person_assigned}})</label>
                                </div>
                            </template>
                        </div>
                        <div class="col">
                            <h4>Sequencing Platform</h4>
                            <div class="form-check form-switch">
                                <input class="form-check-input" type="checkbox" role="switch" id="sequencing_platform_all_switch" v-model="this.$root.all_filters['sequencing_platform']['include_all']"/>
                                <label class="form-check-label" for="sequencing_platform_all_switch">All</label>
                            </div>
                            <template v-for="(nr_with_sequencing_platform, sequencing_platform) in this.$root.allValues('sequencing_platform')">
                                <div class="form-check" @click="(event) => selectFilterValue(event, 'sequencing_platform', sequencing_platform)">
                                    <input class="form-check-input" type="checkbox" :id="'sequencing_platform_filter_'+sequencing_platform" :value="sequencing_platform" v-model="this.$root.all_filters['sequencing_platform']['filter_values']" :disabled="this.$root.all_filters['sequencing_platform']['include_all']"/>
                                    <label class="form-check-label" :for="'sequencing_platform_filter_' + sequencing_platform">{{ sequencing_platform }} ({{this.$root.nrVisibleWith('sequencing_platform', sequencing_platform)}}/{{nr_with_sequencing_platform}})</label>
                                </div>
                            </template>
                        </div>
                    </div>
                </form>
            </div>
            <div class="row row-cols-auto" v-if="Object.keys(this.$root.currentActiveFilters).length > 0">
                <div class="col mr-4 mt-2" v-for="filter_key in Object.keys(this.$root.currentActiveFilters)">
                    <div>
                        <h5>{{this.$root.all_filters[filter_key]['title']}}</h5>
                        <button type="button" class="btn btn-primary btn-lg position-relative mr-2" v-for="value in this.$root.all_filters[filter_key]['filter_values']" @click="removeFilter(event, filter_key, value)">
                            <template v-if="filter_key == 'people_assigned'">
                                {{ this.person_assigned_name(value) }}
                            </template>
                            <template v-else>
                                {{value}}
                            </template>
                            <i class="fa-solid fa-xmark ml-2"></i>
                        </button>
                    </div>
                </div>
            </div>
            <div class="row mt-5 pb-2 border-bottom border-light-subtle">
                <div class="col-2 align-self-end">
                    <h4 my-1>
                        <i :class="'fa-solid ' + this.$root.sorting_icon + ' mr-2'" @click="this.$root.toggleSorting"></i>
                        Showing {{Object.keys(this.$root.visibleProjects).length}} of {{Object.keys(this.$root.project_details).length}} projects in {{Object.keys(this.$root.allColumnValues).length}} columns
                    </h4>
                </div>
                <div class="col-2 form-floating">
                    <select id="card_columns" class="form-select" aria-label="Category to use as columns" v-model="this.$root.card_columns">
                        <option :value="['application']">Application</option>
                        <option :value="['type']">Type</option>
                        <option :value="['project_coordinator']">Project Coordinator</option>
                        <option :value="['lab_responsible']">Lab Responsible</option>
                        <option :value="['status_fields', 'status']">Status</option>
                        <option :value="['library_construction_method']">Library Construction Method</option>
                    </select>
                    <label for="card_columns" class="ml-2">Columns</label>
                </div>
                <div class="col-2 form-floating">
                    <select id="sort_by" class="form-select" aria-label="Sort by" v-model="this.$root.sortBy">
                        <option value="most_recent_date">Most recent date</option>
                        <option value="open_date">Open Date</option>
                        <option value="queue_date">Queue Date</option>
                        <option value="project_id">Project ID</option>
                        <option value="status">Status</option>
                    </select>
                    <label for="sort_by" class="ml-2">Sort by</label>
                </div>
                <div class="col-2 offset-4">
                    <div class="form-floating">
                        <input type="text" class="form-control form-control-lg" v-model="this.$root.search_value"/>
                        <label for="search">Search</label>
                    </div>
                </div>
            </div>
        </div>
        <template v-if="Object.keys(this.$root.visibleProjects).length == 0">
            <template v-if="Object.keys(this.$root.project_details).length == 0">
                <div class="d-flex justify-content-center m-5">
                    <div class="spinner-border" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <h3 class="ml-2">Loading projects...</h3>
                </div>
            </template>
            <template v-else>
                <h3 class="m-3">No projects</h3>
            </template>
        </template>

        <template v-else>
            <div class="project_status_board overflow-scroll bg-white py-3">
                <div class="row flex-nowrap">
                    <template v-for="(project_ids_for_value, value, index) in this.$root.allColumnValues">
                        <div class="col-3 col-xxl-2 mx-3 pt-4 border bg-light rounded-3 align-self-start" >
                            <h3 :ref="'header' + index" my-4>{{ value }}</h3>
                            <div class="row row-cols-1">
                                <div :style="[{marginTop: max_col_header_height - this.col_header_heights['header'+index] + 'px'}, {maxHeight: this.max_card_cols_height + 'px' }, 'overflowY: auto']" >
                                    <div class="col">
                                        <template v-for="(project_id, index) in project_ids_for_value" :key="project_id">
                                            <v-project-card v-if="project_id in this.$root.visibleProjects" :user="this.user" :project_id="project_id" :ref="'project_card_' + project_id" :next_project_id="project_ids_for_value[index + 1]" :previous_project_id="project_ids_for_value[index-1]"></v-project-card>
                                        </template>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </template>
                </div>
            </div>
        </template>
    </div>`,
}


