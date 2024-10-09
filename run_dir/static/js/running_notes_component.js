export const vRunningNotesTab = {
    props: ['user', 'partition_id', 'all_users', 'note_type'],
    data() {
        return {
            category_filter: 'All',
            dropdown_position: {},
            form_categories: [],
            form_note_text: '',
            user_suggestions: [],
            running_notes: [],
            search_term: '',
            submitting: false
        }
    },
    computed: {
        anySuggestion() {
            return this.user_suggestions.length > 0
        },
        new_note_obj() {
            return {
                note: this.form_note_text,
                user: this.user.user,
                email: this.user.email,
                categories: this.form_categories,
                created_at_utc: new Date().toISOString()
            }
        },
        new_note_is_empty(){
            return this.form_note_text === '' && this.form_categories.length === 0
        },
        suggestion_styling() {
            return {
                position: 'absolute',
                top: this.dropdown_position.top + 'px',
                left: this.dropdown_position.left + 'px',
                width: this.dropdown_position.width + 'px',
                height: this.dropdown_position.height + 'px'
            }   
        },
        visible_running_notes() {
            let running_notes_tmp = Object.entries(this.running_notes)

            if (this.search_term !== '') {
                running_notes_tmp = running_notes_tmp.filter(([running_note_key, running_note]) => {
                    return (running_note.note.toLowerCase().includes(this.search_term.toLowerCase())) ||
                                (running_note.user.toLowerCase().includes(this.search_term.toLowerCase())) ||
                                (running_note.categories.join(' ').toLowerCase().includes(this.search_term.toLowerCase()))
                })
            }

            // Filter by category
            if (this.category_filter !== 'All') {
                running_notes_tmp = running_notes_tmp.filter(([running_note_key, running_note]) => {
                    return running_note.categories.includes(this.category_filter)
                })
            }

            return Object.fromEntries(running_notes_tmp)
        },
        visible_user_suggestions() {
            // Only show the first 5 suggestions
            return this.user_suggestions.slice(0, 5)
        }
    },
    methods: {
        async fetchAllRunningNotes(partition_id) {
            axios
                .get('/api/v1/running_notes/' + partition_id)
                .then(response => {
                    let data = response.data
                    if (data !== null) {
                        this.running_notes = data;
                    }
                })
                .catch(error => {
                    this.$root.error_messages.push('Unable to fetch running notes, please try again or contact a system administrator.')
                })
        },
        openNewNoteForm() {
            let new_note_form = this.$refs.new_note_form;
            let new_note_caret = this.$refs.new_note_caret;

            if (!new_note_form.classList.contains('show')) {
                new_note_form.classList.add('show');
                new_note_caret.classList.remove('fa-caret-right');
                new_note_caret.classList.add('fa-caret-down');
                // focus on the textarea
                this.$refs.form_note_text_field.focus();
            }
        },
        setCurrentPosition() {
            let textarea = this.$refs.form_note_text_field;
            if (textarea === undefined) {
                return {}
            }
            this.dropdown_position = this.$root.getDropdownPositionHelper(textarea, 100);
        },
        setFilter(filter) {
            this.category_filter = filter
        },
        submitRunningNote() {
            this.submitting = true;
            if (this.form_note_text === '') {
                alert("Error: No running note entered.");
                return
            }
            if (this.form_categories.length === 0) {
                if (!confirm("Are you sure that you want to submit without choosing a category?")) {
                    return
                }
            }

            if(["flowcell", "workset", "flowcell_ont"].includes(this.note_type)){
                if((this.note_type==="flowcell" || this.note_type==="flowcell_ont") && !this.form_categories.includes("Flowcell")){
                  this.form_categories.push("Flowcell")
                }
                else if(this.note_type==="workset" && !this.form_categories.includes("Workset")){
                  this.form_categories.push("Workset")
                }
            }

            let post_body = {
                note: this.form_note_text,
                categories: this.form_categories,
                note_type: this.note_type
            }


            axios
                .post('/api/v1/running_notes/' + this.partition_id, post_body)
                .then(response => {
                    this.fetchAllRunningNotes(this.partition_id)
                    this.form_note_text = ''
                    this.form_categories = []
                    this.submitting = false
                })
                .catch(error => {
                    alert('Unable to submit running note, please try again or contact a system administrator.')
                    this.submitting = false
                })
        },
        suggestTaggedUsers(event) {
            this.setCurrentPosition();
            let form_note_text_field = this.$refs.form_note_text_field;
            let cursor_position = form_note_text_field.selectionStart;
            let text_before_cursor = form_note_text_field.value.substring(0, cursor_position);
            let current_word = text_before_cursor.split(' ').pop();

            if (current_word.startsWith('@')) {
                current_word = current_word.substring(1).toLowerCase();
                let user_suggestions = this.all_users.filter(user => user.startsWith(current_word));
                this.user_suggestions = user_suggestions;
            } else {
                this.user_suggestions = [];
            }
        },
        tagUser(user) {
            /* 
               Let's think about the different cases.
               space or newline before the @ is always the case.
               but there could either be a space after the @ or not. 
            */

            let form_note_text_field = this.$refs.form_note_text_field;
            let cursor_position = form_note_text_field.selectionStart;
            let text_before_cursor = form_note_text_field.value.substring(0, cursor_position);
            let text_after_cursor = form_note_text_field.value.substring(cursor_position);
            let current_word = text_before_cursor.split(' ').pop()
            let current_word_after = '';
            if (text_after_cursor.charAt(0) == ' ') {
                /* Avoid double spaces when tagging in the middle of the text */
                text_after_cursor = text_after_cursor.substring(1);
            } else {
                /* If there is no space after the @, we need to remove the first word of the text after the cursor */
                current_word_after = text_after_cursor.split(' ')[0];
            }
            /* Create a new text by replacing the word where the @ was found with the @user */
            let new_text = text_before_cursor.substring(0, text_before_cursor.length - current_word.length) + '@' + user + ' ' + text_after_cursor.substring(current_word_after.length);
            this.form_note_text = new_text;
            this.user_suggestions = [];
        },
        toggleNewNoteForm() {
            let new_note_form = this.$refs.new_note_form;
            let new_note_caret = this.$refs.new_note_caret;

            // Remove the show class if it exists
            if (new_note_form.classList.contains('show')) {
                new_note_form.classList.remove('show');
                new_note_caret.classList.remove('fa-caret-down');
                new_note_caret.classList.add('fa-caret-right');
            } else {
                this.openNewNoteForm();
            }
        },
        toggleFormCategory(category) {
            if (this.form_categories.includes(category)) {
                this.form_categories = this.form_categories.filter(item => item !== category);
            } else {
                this.form_categories.push(category);
            }
        }
    },
    mounted() {
        if ( !( ["flowcell", "workset", "flowcell_ont", "project"].includes(this.note_type))) {
            alert("Error: Invalid note type given, will not fetch notes")
            return
        }
        this.fetchAllRunningNotes(this.partition_id);
    },
    template: /*html*/`
    <div class="card text-dark info-border mb-3 mt-3">
        <div class="card-header info-bg pt-3" @click="toggleNewNoteForm()"><h5><i ref="new_note_caret" class="fas fa-caret-right fa-lg pr-2"></i>Add New Running Note</h5></div>
        <form ref="new_note_form" class="card-body collapse">
            <fieldset v-bind:disabled="submitting">
            <div class="row">
                <div class="col form-inline">
                    <label>Choose category:</label>
                    <div class="mt-2" data-toggle="buttons">
                        <button class="btn btn-sm btn-inf mr-2" value="Decision" data-toggle="tooltip" title="For when an executive decision has been made" @click="toggleFormCategory('Decision')">Decision <span class="fa fa-thumbs-up"></span></button>
                        <button class="btn btn-sm btn-succe mr-2" value="Lab" data-toggle="tooltip" title="For lab-related work" @click="toggleFormCategory('Lab')">Lab <span class="fa fa-flask"></span></button>
                        <button class="btn btn-sm btn-warn mr-2" value="Bioinformatics" data-toggle="tooltip" title="For all bioinformatics work" @click="toggleFormCategory('Bioinformatics')">Bioinformatics <span class="fa fa-laptop-code"></span></button>
                        <button class="btn btn-sm btn-usr mr-2" value="User Communication" data-toggle="tooltip" title="For notes influenced by user-contact" @click="toggleFormCategory('User Communication')">User Communication <span class="fa fa-people-arrows"></span></button>
                        <button class="btn btn-sm btn-dang mr-2" value="Administration" data-toggle="tooltip" title="For notes involving documentation" @click="toggleFormCategory('Administration')">Administration <span class="fa fa-folder-open"></span></button>
                        <button class="btn btn-sm btn-imp mr-2" value="Important" data-toggle="tooltip" title="For when a note needs to be highlighted" @click="toggleFormCategory('Important')">Important <span class="fa fa-exclamation-circle"></span></button>
                        <button class="btn btn-sm btn-devi mr-2" value="Deviation" data-toggle="tooltip" title="For notes about a deviation" @click="toggleFormCategory('Deviation')">Deviation <span class="fa fa-frown"></span></button>
                        <button class="btn btn-sm btn-inv mr-2" value="Invoice" data-toggle="tooltip" title="For notes about an invoice" @click="toggleFormCategory('Invoice')">Invoicing <span class="fa fa-file-invoice-dollar"></span></button>
                        <button class="btn btn-sm btn-sticky" value="Sticky" data-toggle="tooltip" title="For sticky notes" @click="toggleFormCategory('Sticky')">Sticky <span class="fa fa-note-sticky"></span></button>
                    </div>
                </div>
            </div>
            <div class="row mb-3">
                <div class="col-md-6 mt-4">
                    <h4>Write Running Note</h4>
                    <textarea id='form_note_text_field' rows="5" class="form-control" list="user_suggestions" v-model="form_note_text" style="height:97px;" ref='form_note_text_field' @keyup="suggestTaggedUsers" @click="suggestTaggedUsers"></textarea>
                    <div :style="suggestion_styling">
                        <ul class="dropdown-menu" :class="{ 'show': anySuggestion}" style='position: static;'>
                            <li v-for="user in visible_user_suggestions">
                                <button class="dropdown-item" type="button" @click="tagUser(user)">{{user}}</button>
                            </li>
                        </ul>
                    </div>
                </div>
                <div class="col-md-6 mt-4">
                    <h4>Preview</h4>
                    <template v-if="new_note_is_empty">
                        <p class="text-muted"><em>Nothing to preview.</em></p>
                    </template>
                    <template v-else>
                        <v-running-note-single :running_note_obj="new_note_obj" :compact="false"/>
                    </template>
                </div>
            </div>
            <div class="row">
                <div class="col-md-6 text-right">
                    <button type="button" class="btn btn-link" data-toggle="modal" data-target="#markdown_help">Markdown Help</button>
                    <template v-if="submitting">
                        <button class="btn btn-primary" type="button" disabled>
                            <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                            Saving Running Note...
                        </button>
                    </template>
                    <template v-else>
                       <button type="submit" class="btn btn-primary" id="save_note_button" @click="submitRunningNote">Submit Running Note</button>
                    </template>
                </div>
            </div>
            </fieldset>
        </form>
    </div>

    <!-- filter running notes -->
    <div id="running_notes_filter" class="row" style="margin-bottom:12px;">
      <div class="col-3 ml-2">
        <label>Search :</label>
        <input type="text" v-model="search_term" class="form-control" ref="note_search"/>
      </div>
      <div class="col-2">
        <label>Filter :</label>

        <div class="dropdown">
            <button class="btn btn-outline-secondary text-dark dropdown-toggle btn_count" type="button" id="rn_category" data-toggle="dropdown" aria-expanded="false"></button>
            <ul class="dropdown-menu" aria-labelledby="rn_category">
                <li><button class="dropdown-item" type="button" @click="setFilter('All')">All</button></li>
                <li><div class="dropdown-divider"></div></li>
                <li><button class="dropdown-item" type="button" @click="setFilter('Workset')">Workset</button></li>
                <li><button class="dropdown-item" type="button" @click="setFilter('Flowcell')">Flowcell</button></li>

                <li><div class="dropdown-divider"></div></li>
                <li><button class="dropdown-item" type="button" @click="setFilter('Decision')">Decision</button></li>
                <li><button class="dropdown-item" type="button" @click="setFilter('Lab')">Lab</button></li>
                <li><button class="dropdown-item" type="button" @click="setFilter('Bioinformatics')">Bioinformatics</button></li>
                <li><button class="dropdown-item" type="button" @click="setFilter('User Communication')">User Communication</button></li>
                <li><button class="dropdown-item" type="button" @click="setFilter('Administration')">Administration</button></li>
                <li><button class="dropdown-item" type="button" @click="setFilter('Important')">Important</button></li>
                <li><button class="dropdown-item" type="button" @click="setFilter('Invoicing')">Invoicing</button></li>
                <li><button class="dropdown-item" type="button" @click="setFilter('Deviation')">Deviation</button></li>
                <li><button class="dropdown-item" type="button" @click="setFilter('Sticky')">Sticky</button></li>
            </ul>
        </div>
      </div>
    </div>

    <!-- display running notes -->
    <template v-for="running_note in visible_running_notes">
        <v-running-note-single :running_note_obj="running_note" :compact="false"/>
    </template>
    `
}


export const vRunningNoteSingle = {
    props: ['running_note_obj', 'compact'],

    computed: {
        categories() {
            return this.getRunningNoteProperty('categories')
        },
        categories_labels() {
            if (this.categories == undefined) {
                return ''
            }
            return this.generate_category_label(this.categories)
        },
        created_at_utc() {
            return this.getRunningNoteProperty('created_at_utc')
        },
        formattedTimeStamp() {
            let date = new Date(this.created_at_utc);
            return date.toDateString() + ', ' + date.toLocaleTimeString(date);
        },
        timestampAge() {
            // Get the timestamp from the running note
            let timestamp = this.created_at_utc;

            // Create a new Date object using the timestamp
            let date = new Date(timestamp);

            // Get the current date
            let now = new Date();

            // Calculate the difference in seconds
            let diffInSeconds = Math.floor((now - date) / 1000);

            if (diffInSeconds < 60) {
                return 'Just now';
            }

            let diffInMinutes = Math.floor(diffInSeconds / 60);
            if (diffInMinutes < 60) {
                return `${diffInMinutes} minutes ago`;
            }

            let diffInHours = Math.floor(diffInMinutes / 60);
            if (diffInHours < 24) {
                return `${diffInHours} hours ago`;
            }

            let diffInDays = Math.floor(diffInHours / 24);
            return `${diffInDays} days ago`;
        },
        formatted_note() {
            if (this.note == undefined) {
                return ''
            }
            return marked.parse(this.note)
        },
        running_note() {
            if (this.running_note_obj == undefined) {
                return undefined
            }
            // Check if running note is an object

            if (typeof this.running_note_obj == 'object') {
                return this.running_note_obj
            }
            let running_note_json = JSON.parse(this.running_note_obj)
            return Object.values(running_note_json)[0];
        },
        email() {
            return this.getRunningNoteProperty('email')
        },
        note() {
            return this.getRunningNoteProperty('note')
        },
        user() {
            return this.getRunningNoteProperty('user')
        }
    },    
    methods: {
        generate_category_label(categories){
            let cat_classes = {
               'Workset': ['primary', 'calendar-plus'],
               'Flowcell': ['success', 'grip-vertical'],
               'Decision': ['info', 'thumbs-up'],
               'Lab': ['succe', 'flask'],
               'Bioinformatics': ['warning', 'laptop-code'],
               'User Communication': ['usr', 'people-arrows'],
               'Administration': ['danger', 'folder-open'],
               'Important': ['imp', 'exclamation-circle'],
               'Deviation': ['devi', 'frown'],
               'Invoicing': ['inv', 'file-invoice-dollar'],
               'Sticky': ['sticky', 'note-sticky']
           }
           let cat_label = '';
           Object.values(categories).forEach(function(val){
             var cat = val.trim()
             if (Object.keys(cat_classes).indexOf(cat) != -1){
                 cat_label += '<span class="badge bg-'+cat_classes[cat][0]+'">'+cat+'&nbsp;'+'<span class="fa fa-'+ cat_classes[cat][1] +'">'+"</span></span> ";
             }
           });
           return cat_label;
        },
        getRunningNoteProperty(key){
            if (this.running_note !== undefined) {
                if (key in this.running_note) {
                    return this.running_note[key]
                }
            }
            return undefined
        }
    },
    template:
    /*html*/`
    <div class="pb-3">
        <div class="card">
            <div class="card-header bi-project-note-header">
                <a class="text-decoration-none" :href="'mailto:' + this.email">{{this.user}}</a>
                <template v-if="!compact">
                - <span class="todays_date">{{ formattedTimeStamp }}</span>
                </template>
                <span> - {{timestampAge}}</span>
                <template v-if="categories">
                - <span v-html="categories_labels"/>
                </template>
            </div>
            <div class="card-body bi-project-note-text">
                <div class="running-note-body text-muted" v-html="formatted_note"/>
            </div>
        </div>
    </div>
    `,
}