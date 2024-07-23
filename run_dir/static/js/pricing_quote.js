app.component('v-pricing-quote', {
    /* Main component of the pricing quote page.
     *
     * Add products from the table to create a quote and switch between price types.
     */
    props: ['origin', 'is_proj_coord'],
    data() {
      return {
        md_message: '',
        md_src_message: '',
        proj_data: {'pi_name':'', 'affiliation':'', 'invoice_downloaded': '', 'order_details':{}, 'invoice_generated': ''},
        cLabel_index: 0,
        active_cost_labels: {},
        template_text_data: {},
        applProj: false,
        noQCProj: false,
        saved_agreement_data: {},
        loaded_version_desc: '',
        loaded_timestamp: '',
        //added because the id wasn't displayed properly in loaded_version_desc otherwise
        proj_id: '',
        agrm_save_success_msg:'',
        latest_cost_calculator: {}
      }
    },
    computed: {
        any_quote() {
            return (this.any_special_addition ||
                    this.any_special_percentage ||
                    Object.keys(this.$root.quote_prod_ids).length)
        },
        any_special_addition() {
            for ([index, label] of Object.entries(this.$root.quote_special_additions)){
              if(label.name!== ''){
                this.active_cost_labels[index] = label
              }
            }
            return Object.keys(this.active_cost_labels).length > 0
        },
        any_special_percentage() {
            return this.$root.quote_special_percentage_label !== ''
        },
        product_cost_sum() {
            /* calculate the cost of the products independent of any special items */
            cost_sum = 0
            cost_academic_sum = 0
            full_cost_sum = 0
            for ([prod_id, prod_count] of Object.entries(this.$root.quote_prod_ids)) {
                cost_sum += prod_count * this.$root.productCost(prod_id)['cost']
                cost_academic_sum += prod_count * this.$root.productCost(prod_id)['cost_academic']
                full_cost_sum +=  prod_count * this.$root.productCost(prod_id)['full_cost']
            }

            return {'cost': cost_sum,
                    'cost_academic': cost_academic_sum,
                    'full_cost': full_cost_sum}
        },
        quote_cost() {
            product_cost = this.product_cost_sum
            cost_sum = product_cost['cost']
            cost_academic_sum = product_cost['cost_academic']
            full_cost_sum = product_cost['full_cost']

            cost_sum_discount = 0
            cost_academic_sum_discount = 0
            full_cost_sum_discount = 0

            if (this.any_special_addition) {
              for ([index, label] of Object.entries(this.active_cost_labels)){
                if(label.value !== ''){
                  cost_sum += label.value
                  cost_academic_sum += label.value
                  full_cost_sum += label.value
                }
              }
            }

            if (this.any_special_percentage) {
                cost_sum_discount = cost_sum * this.$root.quote_special_percentage_value/100
                cost_academic_sum_discount = cost_academic_sum * this.$root.quote_special_percentage_value/100
                full_cost_sum_discount = full_cost_sum * this.$root.quote_special_percentage_value/100
                cost_sum *= (100 - this.$root.quote_special_percentage_value)/100
                cost_academic_sum *= (100 - this.$root.quote_special_percentage_value)/100
                full_cost_sum *= (100 - this.$root.quote_special_percentage_value)/100
            }

            return {'cost': Math.round(cost_sum),
                    'cost_academic': Math.round(cost_academic_sum),
                    'full_cost': Math.round(full_cost_sum),
                    'cost_discount': Math.round(cost_sum_discount),
                    'cost_academic_discount': Math.round(cost_academic_sum_discount),
                    'full_cost_discount': Math.round(full_cost_sum_discount)
                  }
        },
        compiledMarkdown() {
          msg_display = this.md_src_message
          first_page_text = this.template_text_data.first_page_text
          if(this.applProj){
            msg_display += '\n\n'+ first_page_text['specific_conditions']['application_conditions']
          }
          if(this.noQCProj){
            msg_display += '\n\n'+ first_page_text['specific_conditions']['no-qc_conditions']
          }
          if(this.$root.price_type==='full_cost'){
            msg_display += '\n\n'+ first_page_text['specific_conditions']['full_cost_conditions']
          }
          return marked(msg_display, { sanitize: true })
        },
        has_admin_control(){
          return (this.origin === 'Agreement') && (this.is_proj_coord==='True')
        },
        invoice_downloaded(){
          return this.proj_data['invoice_downloaded']!==''? true:false
        },
        invoice_invalidated(){
          return this.proj_data['invoice_generated']==='NA'? true:false
        },
        invoice_generated(){
          return this.proj_data['invoice_generated']!==''? true:false
        },
    },
    created: function() {
        this.$root.fetchPublishedCostCalculator(true),
        this.$root.fetchExchangeRates(),
        this.fetch_latest_agreement_template_doc()
    },
    mounted: function () {
        this.get_project_specific_data()
    },
    watch: {
        md_src_message() {
            this.add_to_md_text()
        },
        agrm_save_success_msg(newVal, oldVal) {
          if(newVal!=''){
            setTimeout(() => {
              this.agrm_save_success_msg = ''
            }, 2000);
          }
        }
    },
    methods: {
        get_project_specific_data() {
          if(this.origin === 'Agreement'){
            proj_id = document.querySelector('#pricing_quote_main').dataset.project
            axios
                .get('/api/v1/project_summary/'+proj_id)
                .then(response => {
                    pdata = response.data
                    this.proj_data['ngi_project_id'] = proj_id + ', '+pdata['project_name']+ ' ('+pdata['order_details']['title']+')'
                    pi_name = pdata['project_pi_name'] ? pdata['project_pi_name'] : ''
                    this.proj_data['pi_name'] = pi_name.split(':')[0]
                    if(pdata['affiliation']){
                      this.proj_data['affiliation'] = pdata['affiliation']
                    }
                    this.proj_data['project_id'] = proj_id
                    this.proj_data['order_id'] = pdata['order_details']['identifier']
                    this.proj_data['project_name'] = pdata['project_name']
                    this.get_order_details(this.proj_data['order_id'])
                    this.proj_id = proj_id
                    if('invoice_spec_downloaded' in pdata){
                      this.proj_data['invoice_downloaded'] = pdata['invoice_spec_downloaded']
                    }
                    if('invoice_spec_generated' in pdata){
                      this.proj_data['invoice_generated'] = pdata['invoice_spec_generated']
                    }
                    if(pdata['type']==='Application'){
                      this.applProj = true
                    }
                    if(pdata['library_prep_option']==='No QC'){
                      this.noQCProj = true
                    }
                    this.add_to_md_text()
                    // Requires a wait to get the published_cost_calculator and only saved Agreements have the option to change cost calculator
                    // so this can be here
                    this.latest_cost_calculator = this.$root.published_cost_calculator
                })
                .catch(error => {
                    this.$root.error_messages.push('Unable to fetch project data, please try again or contact a system administrator.')
                })
                this.get_saved_agreement_data(proj_id)
            }
        },
        get_order_details(order_id){
          axios
              .get('/api/v1/get_order_det_invoicing/'+order_id)
              .then(response => {
                  this.proj_data['order_details'] = response.data
              })
              .catch(error => {
                  this.$root.error_messages.push('Unable to fetch order data, please try again or contact a system administrator.')
                  this.proj_data['order_details'] = { 'reference': '-', 
                                                      'university': '-', 
                                                      'department': '-', 
                                                      'invoice_address': '-', 
                                                      'invoice_zip': '-', 
                                                      'invoice_city': '-', 
                                                      'invoice_country': '-', 
                                                      'invoice_vat': '-', 
                                                      'invoice_organisation_number': '-'
                                                    }
              })
        },
        get_saved_agreement_data(proj_id){
          axios
              .get('/api/v1/get_agreement_doc/'+proj_id)
              .then(response => {
                  this.saved_agreement_data = response.data
                  if(Object.keys(this.saved_agreement_data).includes('signed')){
                    this.load_saved_agreement(this.saved_agreement_data['signed'])
                  }
                  else{
                    if('saved_agreements' in this.saved_agreement_data){
                      let timestamps = Object.keys(this.saved_agreement_data['saved_agreements'])
                      //Load latest saved agreement
                      this.load_saved_agreement(timestamps.reduce((a,b) => a > b ? a : b))
                    }
                  }
              })
              .catch(error => {
                  this.$root.error_messages.push('Unable to fetch agreement data, please try again or contact a system administrator.')
              })
        },
        toggle_discontinued() {
            this.$root.show_discontinued = !this.$root.show_discontinued
        },
        reset_special_percentage() {
            this.$root.quote_special_percentage_label = ''
            this.$root.quote_special_percentage_value = 0
        },
        timestamp_to_date(timestamp) {
          let date = new Date(parseInt(timestamp))
          // A shorter dateformat
          return new Intl.DateTimeFormat("en-UK", {
            year: "numeric",
            month: "short",
            day: "2-digit",
          }).format(date) + ', ' + date.toLocaleTimeString(date)
        },
        load_saved_agreement(timestamp_selected){
          //Reset fields
          this.applProj = false
          this.noQCProj = false
          this.$root.quote_special_additions = {}
          this.active_cost_labels = {}
          this.$root.quote_special_percentage_value = 0.0
          this.$root.quote_special_percentage_label = ''
          var timestamp_val = ""
          var loaded_version = ""
          var query_timestamp_radio = document.querySelector("input[name=saved_agreements_radio]:checked")
          if (query_timestamp_radio){
            timestamp_val = query_timestamp_radio.value
            loaded_version = query_timestamp_radio.labels[0].innerText.split('\n')[0]
          }
          else if(timestamp_selected){
            timestamp_val = timestamp_selected
            agreement_selected =  this.saved_agreement_data['saved_agreements'][timestamp_selected]
            loaded_version = this.timestamp_to_date(timestamp_selected) + ', ' + agreement_selected['created_by'] +
                              ' ('+ agreement_selected['total_cost']+' SEK on cost calc v'+ agreement_selected['cost_calculator_version']+')'
          }
          else{
            alert("No agreement selected")
            return false
          }
          if(timestamp_val!==""){
            this.loaded_timestamp = timestamp_val
            var sel_data = this.saved_agreement_data['saved_agreements'][timestamp_val]
            if('cost_calculator_version' in sel_data){
              if(this.$root.published_cost_calculator["Version"]!==sel_data['cost_calculator_version']){
                axios
                  .get('/api/v1/cost_calculator', {
                    params: { version:  sel_data['cost_calculator_version'] }
                  })
                  .then(response => {
                    this.$root.published_cost_calculator = response.data.cost_calculator
                    this.$root.all_products = response.data.cost_calculator.products
                    this.$root.all_components = response.data.cost_calculator.components
                  })
                  .catch(error => {
                    this.$root.error_messages.push('Unable to fetch used cost calculator data, please try again or contact a system administrator.')
                  })
              }
            }
            this.$root.price_type = sel_data['price_type']
            if('special_addition' in sel_data){
              this.$root.quote_special_additions = sel_data['special_addition']
            }
            if('special_percentage' in sel_data){
              this.$root.quote_special_percentage_label = sel_data['special_percentage']['name']
              this.$root.quote_special_percentage_value = sel_data['special_percentage']['value']
            }
            this.md_src_message = sel_data['agreement_summary']
            if('agreement_conditions' in sel_data){
              if(sel_data['agreement_conditions'].includes('application_conditions')){
                this.applProj = true
              }
              if(sel_data['agreement_conditions'].includes('no-qc_conditions')){
                this.noQCProj = true
              }
            }
            //Make sure selected fields are displayed
            this.add_to_md_text()
            this.$root.quote_prod_ids = sel_data['products_included']
            this.$root.fetchExchangeRates(sel_data['exchange_rate_issued_date'])
            this.loaded_version_desc = 'Version: '+ loaded_version + ' \n' +
                                    'Agreement_number: '+this.proj_id+'_'+timestamp_val
            if('template_text' in sel_data){
              this.template_text_data = sel_data['template_text']
            }
          }
        },
        mark_agreement_signed(){
          var query_timestamp_radio = document.querySelector("input[name=saved_agreements_radio]:checked")
          var timestamp_val = query_timestamp_radio ? query_timestamp_radio.value : ""
          if(timestamp_val!==""){
            proj_id = this.proj_data['project_id']
            axios.post('/api/v1/mark_agreement_signed', {
                proj_id: proj_id,
                timestamp: timestamp_val
            }).then(response => {
                this.get_saved_agreement_data(proj_id)
            })
            .catch(error => {
                this.$root.error_messages.push('Unable to mark agreement signed, please try again or contact a system administrator.')
            })
          }
        },
        generate_invoice_spec(action_type){
          let timestamp_val = ""
          if(action_type === 'generate'){
            let query_timestamp_radio = document.querySelector("input[name=saved_agreements_radio]:checked")
            timestamp_val= query_timestamp_radio ? query_timestamp_radio.value : ""
          }
          else if(action_type === 'invalidate'){
            timestamp_val = "NA"
          }
          if(timestamp_val!==""){
            proj_id = this.proj_data['project_id']
            axios.post('/api/v1/generate_invoice_spec', {
                proj_id: proj_id,
                timestamp: timestamp_val,
                action_type: action_type
            }).then(response => {
                if(action_type === 'generate' && response.data['message']==='Invoice spec generated'){
                  this.get_saved_agreement_data(proj_id)
                }
            })
            .catch(error => {
                this.$root.error_messages.push('Unable to generate invoice spec, please try again or contact a system administrator.')
            })
          }
        },

        fetch_latest_agreement_template_doc: function(){
          axios
              .get('/api/v1/get_agreement_template_text')
              .then(response => {
                  this.template_text_data = response.data
                  this.md_src_message = this.template_text_data.first_page_text.agreement_summary
              })
              .catch(error => {
                  this.$root.error_messages.push('Unable to fetch agreement template data, please try again or contact a system administrator.')
              })
        },
        add_cost_label: function(){
          this.$root.quote_special_additions[this.cLabel_index] = { name: '', value: 0 }
          this.cLabel_index++
        },
        remove_cost_label: function(index){
          delete this.$root.quote_special_additions[index]
          if(this.active_cost_labels.hasOwnProperty(index)){
            delete this.active_cost_labels[index]
          }
        },
        add_to_md_text: function(){
          this.md_message = this.compiledMarkdown
        },
        submit_quote_form: function(agreement_data, type){
          if(type!=='save'){
            /* Submitting it in a form to get the generated quote doc to open in a new page/tab */
            var newForm = $('<form>', {
              'action': '/generate_quote',
              'target': '_blank',
              'method': 'post',
              'enctype':'text/plain',
              'id': 'my_form'
            }).append($('<input>', {
                  'name': 'data',
                  'value': JSON.stringify(agreement_data),
                  'type': 'hidden'
                }))
            newForm.hide()
            newForm.appendTo("body")
            newForm.submit()
          }
          else{
            axios.post('/api/v1/save_quote', {
                data: agreement_data,
            }).then(response => {
                this.agrm_save_success_msg = response['data']['message']
            })
            .catch(error => {
                this.$root.error_messages.push('Unable to save agreement, please try again or contact a system administrator.')
            })
          }
        },
        generate_quote:  function (type) {
          agreement_data = {}
          agreement_data['type'] = type
          product_list = {}
          for (prod_id in this.$root.quote_prod_ids){
            product = this.$root.all_products[prod_id]
            prod_name = product['Name']+' ('+this.$root.quote_prod_ids[prod_id]+')'
            prod_cost = Math.round((this.$root.productCost(prod_id)[this.$root.price_type] * this.$root.quote_prod_ids[prod_id]).toFixed(2))
            product_list[prod_name] = prod_cost
          }
          agreement_data['price_breakup'] = product_list
          agreement_data['total_products_cost'] = Math.round(this.product_cost_sum[this.$root.price_type])
          agreement_data['total_cost'] = Math.round(this.quote_cost[this.$root.price_type])
          agreement_data['total_cost_discount'] = Math.round(this.quote_cost[this.$root.price_type+'_discount'])
          agreement_data['price_type'] = this.$root.price_type
          if (this.any_special_addition){
            agreement_data['special_addition'] =  this.active_cost_labels
          }
          if (this.any_special_percentage){
            agreement_data['special_percentage'] = {'name': this.$root.quote_special_percentage_label,
                                                     'value':  this.$root.quote_special_percentage_value}
          }
          if(this.message !== ''){
            agreement_data['agreement_summary'] = this.md_src_message
          }
          agreement_data['agreement_conditions'] = []
          if(this.applProj){
            agreement_data['agreement_conditions'].push('application_conditions')
          }
          if(this.noQCProj){
            agreement_data['agreement_conditions'].push('no-qc_conditions')
          }
          agreement_data['template_text'] = this.template_text_data
          agreement_data['origin'] = this.origin
          if(this.origin === 'Agreement'){
            let timestamp = Date.now()
            if(type === 'display'){
              let query_timestamp_radio = document.querySelector("input[name=saved_agreements_radio]:checked")
              if(!query_timestamp_radio){
                alert("No agreement selected")
                return false
              }
              timestamp = query_timestamp_radio.value
            }
            this.proj_data['agreement_number'] = this.proj_data['project_id'] + '_'+ timestamp
            agreement_data['project_data'] = this.proj_data
            agreement_data['project_data']['user_and_affiliation'] = this.proj_data['pi_name']+ ' / ' + this.proj_data['affiliation']
            agreement_data['products_included'] = this.$root.quote_prod_ids
          }
          agreement_data['exchange_rate_issued_date'] = this.$root.exch_rate_issued_at
          agreement_data['cost_calculator_version'] =  this.$root.published_cost_calculator["Version"]
          this.submit_quote_form(agreement_data, type)
          if(type === 'save'){
            setTimeout(()=>{
              this.get_saved_agreement_data(this.proj_data['project_id']) },1000)
              this.loaded_version_desc =  ''
          }
        }
    },
    template:
        /*html*/`
        <div class="row" v-if="origin === 'Quote'">
          <h1 class="col-md-11 mb-3"><span id="page_title">Cost Calculator</span></h1>
        </div>
        <div class="row" v-if="origin === 'Agreement'">
          <h1 class="col mb-3"><span id="page_title">Generate Agreement for {{ this.proj_data['ngi_project_id'] }}</span></h1>
        </div>
        <template v-if="this.$root.published_data_loading">
          <v-pricing-data-loading/>
        </template>
        <template v-else>
          <template v-if="this.$root.any_errors">
            <v-pricing-error-display/>
          </template>
          <div class="row">
            <div class="col-5 status_limit_width_large">
              <div class="fw-bold p-3 border border-secondary rounded-3 my-2">
                Using cost calculator version {{ this.$root.published_cost_calculator["Version"] }} (published {{ new Date(this.$root.published_cost_calculator["Issued at"]).toLocaleString() }})
              </div>
              <div v-if="this.origin === 'Agreement' && this.latest_cost_calculator && this.$root.published_cost_calculator['Version']!== latest_cost_calculator['Version']" class="alert alert-danger" role="alert">
                The latest cost calculator version is {{ this.latest_cost_calculator["Version"] }} (published {{ new Date(this.latest_cost_calculator["Issued at"]).toLocaleString() }})
              </div>
              <div class="py-2">
                <h4>Pricing Category</h4>
                <div class="btn-group pb-2 ml-1" role="group" aria-label="Radio buttons for selecting price category" id="price_type_selector">
                  <input type="radio" class="btn-check" name="price_type" v-model="this.$root.price_type" value="cost_academic" id="price_type_sweac" @change="add_to_md_text">
                  <label class="btn btn-outline-primary" for="price_type_sweac">Swedish academia</label>

                  <input type="radio" class="btn-check" name="price_type" v-model="this.$root.price_type" value="full_cost" id="price_type_industry" @change="add_to_md_text">
                  <label class="btn btn-outline-primary" for="price_type_industry">Industry and non-Swedish academia</label>

                  <input type="radio" class="btn-check" name="price_type" v-model="this.$root.price_type" value="cost" id="price_type_internal" @change="add_to_md_text">
                  <label class="btn btn-outline-primary" for="price_type_internal">Internal</label>
                </div>
              </div>
              <div class="row pt-2">
                <v-exchange-rates :mutable="true" :issued_at="this.$root.exch_rate_issued_at"/>
              </div>
              <div v-if="origin === 'Agreement'">
                <div class="py-2">
                  <h4>PI Information</h4>
                  <div class="form-floating mb-3 col-4 ml-1">
                    <input type="text" class="form-control" id="pi_name" name="pi_name" v-model="proj_data['pi_name']" 
                    :class="{'is-invalid': proj_data['pi_name'].length<=0}" placeholder="PI name is empty!">
                    <label for="pi_name">PI name</label>
                    <span v-if="!proj_data['pi_name'].length " class="text-danger pl-1">PI name is empty!</span>
                  </div>
                  <div class="form-floating mb-3 col-4 ml-1">
                    <input type="text" class="form-control" id="affiliation" name="affiliation" v-model="proj_data['affiliation']" 
                    :class="{'is-invalid': proj_data['affiliation'].length<=0}" placeholder="Affiliation is empty!">
                    <label for="affiliation">Affiliation</label>    
                    <span v-if="!proj_data['affiliation'].length " class="text-danger pl-1">Affiliation is empty!</span>    
                  </div>
                </div>
                <div class="py-2"> 
                  <h4 class="mb-2">Invoicing details</h4> 
                  <dl class="dl-horizontal-invoicing pl-1">
                    <dt>Invoice Reference</dt>
                      <dd>{{ this.proj_data['order_details']['reference'] }} </dd>
                    <dt>University</dt>
                      <dd>{{ this.proj_data['order_details']['university'] }} </dd>
                    <dt>Department</dt>
                      <dd>{{ this.proj_data['order_details']['department'] }} </dd>  
                    <dt>Address</dt>
                      <dd>{{ this.proj_data['order_details']['invoice_address'] }} </dd>
                    <dt>Postal Code</dt>
                      <dd>{{ this.proj_data['order_details']['invoice_zip'] }}</dd>
                    <dt>City</dt>
                      <dd>{{ this.proj_data['order_details']['invoice_city'] }} </dd>
                    <dt>Country</dt>
                      <dd>{{ this.proj_data['order_details']['invoice_country'] }} </dd>
                    <dt>VAT Number</dt>
                      <dd>{{ this.proj_data['order_details']['invoice_vat'] }} </dd>
                    <dt>Organisation number</dt>
                      <dd>{{ this.proj_data['order_details']['invoice_organisation_number'] }} </dd>
                  </dl>
                </div>
              </div>
              <div class="py-2"> 
                <h4>Agreement Summary</h4> 
                <div class="row mx-2">
                  <label class="form-check-label p-1" for="template_text_btn_group"> Add project template text for: </label>
                  <div class="col pl-0">
                    <div class="form-check form-switch">
                      <input class="form-check-input" type="checkbox" id="appCheck" v-model="applProj" @change="add_to_md_text">
                      <label class="form-check-label" for="appCheck">Applications</label>
                    </div>
                    <div class="form-check form-switch">
                      <input class="form-check-input" type="checkbox" id="noQCCheck" v-model="noQCProj" @change="add_to_md_text">
                      <label class="form-check-label" for="noQCCheck">No-QC</label>
                    </div>
                  </div>
                </div>
                <div class="row pt-2">
                    <div id="pricing_freeformtext_editor" class="form-floating pl-1 ml-3">
                      <textarea v-model="this.md_src_message" class="form-control" id="pricing_freeformtext_editor_textarea" placeholder="Agreement Summary" style="height: 140px"></textarea>
                      <label for="pricing_freeformtext_editor_textarea">Agreement Summary</label>
                    </div>
                </div>
              </div>
              <div class="row pt-3">
                <h4 class="pb-0 mb-0">Non-Standard Costs</h4>
                <div class="col-3 pt-2 d-flex align-items-center">
                  <button class="btn btn-sm btn-outline-primary" @click="add_cost_label"><i class="fa fa-plus fa-lg" aria-hidden="true"></i> Add Extra Cost</button>
                </div>
                <div class="col-9 pt-2">
                  <div class="form-text">Specify a sum (positive or negative) that will be added to the quote cost. Will only be applied if a label is specified.</div>
                </div>
              </div>
              <div class="row" v-for="(label, index) in this.$root.quote_special_additions" :key="index" :id="'cLabelRow_'+index">
                <div class="col-2">
                  <label :for="'cost_label_val_'+ index" class="form-label">Cost </label>
                  <input :id="'cost_label_val'+ index" class="form-control" v-model.number="label.value" type="number">
                </div>
                <div class="col-10">
                  <label :for="'cost_label_'+ index" class="form-label">Label</label>
                  <div class="row">
                    <div class="col-11">
                      <input :id="'cost_label_'+ index" class="form-control" v-model="label.name" type="text" >
                    </div>
                    <div class="col-1 d-flex align-items-center">
                      <i class="far fa-times-square fa-lg text-danger" aria-hidden="true" @click.self="remove_cost_label(index)"></i>
                    </div>
                  </div>
                </div>
              </div>
              <div class="row pt-3">
              <h4 class="pb-0 mb-0">Discount</h4>
                <div class="col-2">
                  <label for='percentage_input' class="form-label">Percentage</label>
                  <input id='percentage_input' class="form-control" type="number" v-model.number="this.$root.quote_special_percentage_value">
                </div>
                <div class="col-10">
                  <label for='percentage_label' class="form-label">Percentage label</label>
                  <input id='percentage_label' class="form-control" type="text" v-model="this.$root.quote_special_percentage_label">
                </div>
                <div class="mb-3 form-text">Specify a percentage (positive or negative) that will be subtracted (default is discount) from the total sum. Will only be applied if a label is specified.</div>
              </div>
              <button class="btn btn-link" id="more_options_btn" type="button" data-toggle="collapse" data-target="#more_options" aria-expanded="false" aria-controls="more_options">
                More Options
              </button>
              <div class="collapse border-top py-3" id="more_options">
                <template v-if="this.$root.show_discontinued">
                  <button type="button" class="btn btn-success" id="toggle_discontinued" @click="toggle_discontinued">Hide Discontinued Products <i class="fas fa-book-heart fa-lg pl-2"></i></button>
                </template>
                <template v-else>
                  <button type="button" class="btn btn-warning" id="toggle_discontinued" @click="toggle_discontinued">Show Discontinued Products <i class="fas fa-exclamation-triangle fa-lg pl-2"></i></button>
                </template>
              </div>
            </div>
            <div class="col-5 offset-1 status_limit_width_large">
              <div class="row justify-content-end">
                <div class="col-auto">
                  <div class="fw-bold p-2 border border-secondary rounded-3 my-2">
                   <span v-if="this.invoice_invalidated"> No</span> Invoicing Required 
                   <button v-if="this.has_admin_control" class="btn btn-warning m-1" data-toggle="modal" data-target="#confirm_invalidate_inv_spec" :disabled="this.invoice_invalidated || this.invoice_generated">
                   <i class="far fa-ban fa-lg"></i> No</button>
                  </div>
                </div>
                <!-- Confirm Inv invalidation Modal -->
                <div class="modal fade" id="confirm_invalidate_inv_spec" tabindex="-1" role="dialog" aria-labelledby="invalidate_inv_spec_label">
                  <div class="modal-dialog" role="document">
                    <div class="modal-content">
                      <div class="modal-header">
                        <h4 class="modal-title" id="invalidate_inv_spec_label">Confirm invoice invalidation</h4>
                        <button type="button" class="btn-close" data-dismiss="modal" aria-label="Close"></button>
                      </div>
                      <div class="modal-body">
                        Confirm that no invoicing is required for this project.
                      </div>
                      <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
                        <button id='invalidate-inv-gen-btn' type="button" class="btn btn-primary" @click="generate_invoice_spec('invalidate')" data-dismiss="modal">Continue</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="row" v-if="this.saved_agreement_data['saved_agreements']">
                <h4 v-if="this.saved_agreement_data">Generated Agreements</h4>
                <div class="col ml-2">
                  <template v-for="(agreement, timestamp) in this.saved_agreement_data['saved_agreements']" :key="timestamp">
                        <div class="form-check m-2">
                          <input class="form-check-input" type="radio" name="saved_agreements_radio" :id="timestamp" :value="timestamp" :checked="this.loaded_timestamp===timestamp">
                          <label class="form-check-label" :for="timestamp">
                          <div v-bind:class="{ 'fw-bold' : timestamp === this.loaded_timestamp}"> {{ timestamp_to_date(timestamp) }}, {{ agreement['created_by']}} ({{ agreement['total_cost'] }} SEK on cost calc v{{ agreement['cost_calculator_version'] }})</div>
                          <p v-if="this.saved_agreement_data['signed']===timestamp" aria-hidden="true" class="m-2 text-danger fs-6">
                          <i class="far fa-file-signature fa-lg"></i>  Marked Signed {{ this.saved_agreement_data['signed_by'] }}, {{ timestamp_to_date(this.saved_agreement_data['signed_at']) }}</p>
                          <p v-if="this.saved_agreement_data['invoice_spec_generated_for']===timestamp" aria-hidden="true" class="m-2 text-success fs-6">
                          <i class="far fa-file-invoice fa-lg"></i>  Spec Generated {{ this.saved_agreement_data['invoice_spec_generated_by'] }}, {{ timestamp_to_date(this.saved_agreement_data['invoice_spec_generated_at']) }}</p>
                          </label>
                        </div>
                  </template>
                  <div class="align-self-center">
                    <button class="btn btn-primary m-1" @click="load_saved_agreement()">Load</button>
                    <button v-if="this.has_admin_control" class="btn btn-secondary m-1" type="submit" v-on:click="generate_quote('display')" :disabled="this.invoice_downloaded" id="generate_quote_btn">Display Agreement</button>
                    <button v-if="this.has_admin_control" class="btn btn-danger m-1" @click="mark_agreement_signed" :disabled="this.invoice_downloaded"><i class="far fa-file-signature fa-lg"></i> Mark Signed</button>
                    <button v-if="this.has_admin_control" class="btn btn-success m-1" data-toggle="modal" data-target="#confirm_submit_inv_spec" :disabled="this.invoice_downloaded"><i class="far fa-file-invoice fa-lg"></i> Generate Invoice specification</button>
                    <!-- Confirm Inv Spec submission Modal -->
                    <div class="modal fade" id="confirm_submit_inv_spec" tabindex="-1" role="dialog" aria-labelledby="myModalLabel">
                      <div class="modal-dialog" role="document">
                        <div class="modal-content">
                          <div class="modal-header">
                            <h4 class="modal-title" id="myModalLabel">Verify Invoice Ref and Address</h4>
                            <button type="button" class="btn-close" data-dismiss="modal" aria-label="Close"></button>
                          </div>
                          <div class="modal-body">
                            <dl class="dl-horizontal-invoicing">
                              <dt>Invoice Reference</dt>
                                <dd>{{ this.proj_data['order_details']['reference'] }} </dd>
                              <dt>University</dt>
                                <dd>{{ this.proj_data['order_details']['university'] }} </dd>
                              <dt>Department</dt>
                                <dd>{{ this.proj_data['order_details']['department'] }} </dd>  
                              <dt>Address</dt>
                                <dd>{{ this.proj_data['order_details']['invoice_address'] }} </dd>
                              <dt>Postal Code</dt>
                                <dd>{{ this.proj_data['order_details']['invoice_zip'] }}</dd>
                              <dt>City</dt>
                                <dd>{{ this.proj_data['order_details']['invoice_city'] }} </dd>
                              <dt>Country</dt>
                                <dd>{{ this.proj_data['order_details']['invoice_country'] }} </dd>
                              <dt>VAT Number</dt>
                                <dd>{{ this.proj_data['order_details']['invoice_vat'] }} </dd>
                              <dt>Organisation number</dt>
                                <dd>{{ this.proj_data['order_details']['invoice_organisation_number'] }} </dd>
                            </dl>
                          </div>
                          <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
                            <button id='generate_invoice_spec-btn' type="button" class="btn btn-primary" @click="generate_invoice_spec('generate')" data-dismiss="modal">Continue</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="card mt-5">
                <div class="card-header">
                  <h4>Preview <small>Using template: {{this.template_text_data.doc_id}}-{{this.template_text_data.edition}}</small></h4>
                </div>
                <div class="card-body mx-2">
                  <div class="pb-2 text-muted" style="white-space: pre;">
                    {{ this.loaded_version_desc }}
                  </div>
                  <div class="md_display_box bg-white border" v-html="md_message"></div>
                  <template v-if="this.any_quote">
                    <div class="pt-4" id="current_quote">
                      <div class="col ">
                        <h4>Added Products</h4>
                        <div id='product_warnings'></div>
                        <ul class="list-unstyled quote-product-list">
                          <span class="help-block">
                            To use fractions of units, please use full stop and not decimal comma.
                          </span>
                          <template v-for="(prod_count, prod_id) in this.$root.quote_prod_ids" :key="prod_id">
                            <v-quote-list-product :product_id="prod_id" :product_count="prod_count"/>
                          </template>
                          <template v-if="any_special_addition">
                            <li class="row my-2 align-items-center" v-for="(label, index) in this.active_cost_labels" :key="index" >
                              <span class="col-1 pr-0 text-right">
                                <a href='#' @click="remove_cost_label(index)" @click.prevent="activeNews(1)">
                                  <i class="far fa-times-square fa-lg text-danger"></i>
                                </a>
                              </span>
                              <span class="col-6 offset-2">
                                {{ label.name }}
                              </span>
                              <span class="col-3 text-right font-monospace">{{ label.value.toFixed(2) }} SEK</span>
                            </li>
                          </template>
                          <template v-if="any_special_percentage">
                            <li class="row mt-4 mb-1 align-items-center">
                              <span class="col-1 pr-0 text-right">
                                <a href='#' @click="reset_special_percentage" @click.prevent="activeNews(1)">
                                  <i class="far fa-times-square fa-lg text-danger"></i>
                                </a>
                              </span>
                              <span class="col-6 offset-2">
                                Discount: {{ this.$root.quote_special_percentage_label }}(-{{ this.$root.quote_special_percentage_value }}%)
                              </span>
                              <span class="col-3 text-right font-monospace">- {{ quote_cost[this.$root.price_type+"_discount"] }} SEK</span>
                            </li>
                          </template>
                          <div class="row border-top border-2 ml-3">
                            <!-- Empty border div so that we can use margin on it -->
                          </div>
                          <li class="row">
                            <div class="col-6 offset-3 pt-2 fw-bold">
                              TOTAL
                              <template v-if="this.$root.price_type == 'cost_academic'">
                              (Swedish academia)
                              </template>
                              <template v-if="this.$root.price_type == 'full_cost'">
                              (Industry and non-Swedish academia)
                              </template>
                              <template v-if="this.$root.price_type == 'cost'">
                              (Internal projects)
                              </template>
                            </div>
                            <p class="text-right col-3 pt-2 fw-bold font-monospace">
                              {{quote_cost[this.$root.price_type]}} SEK
                            </p>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </template>
                </div>
              </div>
              <div class="row row-cols-lg-auto my-3 justify-content-end">
                <span v-if="this.agrm_save_success_msg!=''" class="text-success pt-2"><span class="fa fa-check"></span> {{ this.agrm_save_success_msg }}</span>
                <div class="col-1 pr-0">
                  <button type="submit" class="btn btn-secondary" id="generate_quote_btn" v-on:click="generate_quote('preview')">Generate {{ this.origin }} Preview</button>
                </div>
                <div class="col-1" v-if="this.has_admin_control">
                  <button type="submit" class="btn btn-primary" id="generate_quote_btn" v-on:click="generate_quote('save')" :disabled="this.invoice_downloaded"> Save Agreement</button>
                </div>
              </div>
              <div v-if="origin === 'Agreement'" class="ml-n1 mt-5">
                <div class="card mt-5">
                  <div class="card-header">
                    <h4>Invoicing Running Notes</h4>
                  </div>
                  <div class="card-body">
                    <div id="invoicing_notes"></div>
                  </div>
                </div>
              </div>
          </div>

          <div class="products_chooseable_div mt-4">
            <div class="row" id="table_h_and_search">
              <h2 class="col mr-auto">Available Products</h2>
            </div>
            <v-products-table :show_discontinued="this.$root.show_discontinued" :quotable="true"/>
          </div>
        </template>
      `
})

app.component('v-quote-list-product', {
    /* Display products which are added to the quote */
    props: ['product_id'],
    computed: {
        product() {
            return this.$root.all_products[this.product_id]
        },
        productCost() {
            // Returns a {'cost': cost, 'cost_academic': cost_academic, 'full_cost': full_cost}
            return this.$root.productCost(this.product_id)
        },
        cost() {
            return Math.round((this.product_count * this.productCost[this.$root.price_type]))
        },
        product_count() {
            return this.$root.quote_prod_ids[this.product_id]
        }
    },
    methods: {
        remove_from_quote() {
            delete this.$root.quote_prod_ids[this.product_id]
        }
    },
    template: /*html*/`
      <li class="row my-1 py-0 align-items-center">
        <div class="col-1 pr-0 text-right">
          <a href='#' @click="remove_from_quote" @click.prevent="activeNews(1)"><i class="far fa-times-square fa-lg text-danger"></i></a>
        </div>
        <div class="col-2">
          <input class="form-control py-1" v-model="this.$root.quote_prod_ids[product_id]" min=0 :data-product-id="product['REF_ID']" type=number>
        </div>
        <span class="col-6 quote_product_name">{{product.Name}}</span>
        <span class="col-3 text-right font-monospace">{{cost}} SEK</span>
      </li>
    `
})

app.mount('#pricing_quote_main')
