/* Does not follow the Vue style guide: https://v3.vuejs.org/style-guide/
feel free to update */
const vPricingMain = {
    /* Main pricing app that all components will be added to.
     * The ambition is to keep the data stored here in the root so that components
     * can easily reach the data by using the this.$root short cut.
     * The exception is if data is never accessed from outside of the component itself.
     */
    data() {
        return {
            // Main data holders
            all_components: null,
            all_products: null,
            draft_cost_calculator: null,
            published_cost_calculator: null,

            // Tracking changes
            component_changes: Object(),
            product_changes: Object(),
            new_products: new Set(),
            new_components: new Set(),
            validation_msgs: Object({'products': {}, 'components': {}}),

            // Convenience
            current_user_email: null,
            draft_data_loading: true,
            published_data_loading: true,
            error_messages: [],
            // Looks weird, but products are never removed, so using 52 instead of null shouldn't break
            // and we don't have to handle the null edge case.
            modal_product_id: "52",
            modal_type: "Regular",
            show_discontinued: false,

            // Exchange rates
            USD_in_SEK: null,
            EUR_in_SEK: null,
            exch_rate_issued_at: null,

            // Quote data
            quote_prod_ids: {},
            quote_special_additions: {},
            quote_special_percentage_value: 0.0,
            quote_special_percentage_label: '',
            price_type: 'cost_academic'
        }
    },
    computed: {
        any_errors() {
            return (this.error_messages.length !== 0)
        },
        no_validation_messages() {
          return (Object.keys(this.validation_msgs['products']).length === 0) && (Object.keys(this.validation_msgs['components']).length === 0)
        },
        done_loading() {
            return (!this.draft_data_loading && !this.published_data_loading)
        },
        all_products_per_category() {
            prod_per_cat = {};
            for ([prod_id, product] of Object.entries(this.all_products)) {
                if ( this.new_products.has(prod_id) ) {
                    cat = "New products"
                } else {
                    cat = product['Category']
                }
                if (! (product['Status'] == 'Discontinued')) {
                    if (! (cat in prod_per_cat)) {
                        prod_per_cat[cat] = []
                    }
                    prod_per_cat[cat].push(product)
                }
            }


            for (category in prod_per_cat) {
                if ( category == "New products" ) {
                    sorted_products = prod_per_cat[category].sort(this.sortProductsByID)
                } else {
                    sorted_products = prod_per_cat[category].sort(this.sortProducts)
                }
                prod_per_cat[category] = sorted_products
            }
            return prod_per_cat
        },
        product_categories() {
            categories = new Set();
            add_new_at_start = false;
            for ([prod_id, product] of Object.entries(this.all_products)) {
                if (! (product['Status'] == 'Discontinued')) {
                    if ( this.new_products.has(prod_id) ) {
                        add_new_at_start = true;
                    }
                    categories.add(product['Category'])
                }
            }

            categories_array = Array.from(categories).sort()
            if (add_new_at_start) {
                categories_array.unshift('New products')
            }
            return categories_array
        },
        product_types() {
            types = new Set();
            for ([prod_id, product] of Object.entries(this.all_products)) {
                if (! (product['Status'] == 'Discontinued')) {
                    types.add(product['Type'])
                }
            }
            return types
        },
        discontinued_products() {
            disco_products = [];
            for ([prod_id, product] of Object.entries(this.all_products)) {
                if (product['Status'] == 'Discontinued') {
                    disco_products.push(product)
                }
            }
            return disco_products.sort(this.sortProducts)
        },
        all_components_per_category() {
            comp_per_cat = {};

            for ([comp_id, component] of Object.entries(this.all_components)) {
                if ( this.new_components.has(comp_id) ) {
                    cat = "New components"
                } else {
                    cat = component['Category']
                }
                if (! (component['Status'] == 'Discontinued')) {
                    if (! (cat in comp_per_cat)) {
                        comp_per_cat[cat] = [];
                    }
                    comp_per_cat[cat].push(component)
                }
            }



            for (category in comp_per_cat) {
                if (category == 'New components') {
                    sorted_components = comp_per_cat[category].sort(this.sortComponentsByID)
                } else {
                    sorted_components = comp_per_cat[category].sort(this.sortComponents)
                }
                comp_per_cat[category] = sorted_components
            }

            return comp_per_cat
        },
        component_categories() {
            categories = new Set();
            add_new_at_start = false;
            for ([comp_id, component] of Object.entries(this.all_components)) {
                if (! (component['Status'] == 'Discontinued')) {
                    if ( this.new_components.has(comp_id) ) {
                        add_new_at_start = true;
                    }
                    categories.add(component['Category'])
                }
            }
            categories_array = Array.from(categories).sort()
            if (add_new_at_start) {
                categories_array.unshift('New components')
            }
            return categories_array
        },
        component_types() {
            types = new Set();
            for ([comp_id, component] of Object.entries(this.all_components)) {
                if (! (component['Status'] == 'Discontinued')) {
                    types.add(component['Type'])
                }
            }
            return types
        },
        discontinued_components() {
            disco_components = [];
            for ([comp_id, component] of Object.entries(this.all_components)) {
                if (component['Status'] == 'Discontinued') {
                    disco_components.push(component)
                }
            }
            return disco_components.sort(this.sortComponents)
        },
        next_product_id() {
            /* Returns the lowest unused product id */
            all_ids = Object.keys(this.all_products)
            max_id = Math.max(...all_ids.map(x => parseInt(x)))
            return (1 + max_id).toString()
        },
        next_component_id() {
            /* Returns the lowest unused component id */
            all_ids = Object.keys(this.all_components)
            max_id = Math.max(...all_ids.map(x => parseInt(x)))
            return (1 + max_id).toString()
        }
    },
    watch: {
        done_loading(newVal, oldVal) {
            /* Need to wait for both cost calculator and draft calculator to be loaded by http
             * before figuring out which items have been added in the draft.
             */
            if(newVal) {
                if (this.draft_cost_calculator !== null && this.published_cost_calculator !== null) {
                    this.assignNewItems()
                }
            }
        },
        all_products: {
            handler(newVal, oldVal) {
                this.validate()
            },
            deep: true
        },
        all_components: {
            handler(newVal, oldVal) {
                this.validate()
            },
            deep: true
        }
    },
    methods: {
        // Data modification methods
        discontinueProduct(prod_id) {
            this.all_products[prod_id]['Status'] = 'Discontinued'
        },
        enableProduct(prod_id) {
            this.all_products[prod_id]['Status'] = 'Available'
        },
        discontinueComponent(comp_id) {
            this.all_components[comp_id]['Status'] = 'Discontinued'
        },
        enableComponent(comp_id) {
            this.all_components[comp_id]['Status'] = 'Available'
        },
        cloneProduct(prod_id) {
            product = this.all_products[prod_id]
            new_prod = Object.assign({}, product)
            /* The assign creates a shallow copy, so we
               need to empty the component list */
            new_prod['Components'] = {}
            new_prod['Alternative Components'] = {}
            new_id = this.next_product_id
            new_prod['REF_ID'] = new_id
            this.all_products[new_id] = new_prod
            this.new_products.add(new_id)
            return new_id
        },
        newProduct() {
            new_id = this.next_product_id
            /* Hacky way to be able to avoid typing all keys that a product should contain */
            old_id = parseInt(new_id) - 1
            new_id = this.cloneProduct(old_id)
            new_product = {}
            Object.keys(this.all_products[new_id]).forEach(function(key) {
                switch(key) {
                    case 'REF_ID':
                        new_product[key] = new_id
                        break;
                    case 'Status':
                        new_product[key] = 'Available'
                        break;
                    case 'Components':
                        new_product[key] = {}
                        break;
                    case 'Alternative Components':
                        new_product[key] = {}
                        break;
                    default:
                        new_product[key] = ''
                }
            })
            this.all_products[new_id] = new_product
            return new_id
        },
        removeProduct(prod_id) {
            /* meant to be used with new products only */
            delete this.all_products[prod_id]
            delete this.new_products[prod_id]
        },
        addProductComponent(product_id, component_id, type) {
            var product = this.all_products[product_id.toString()]
            if (type == 'Alternative') {
                key = 'Alternative Components'
            } else {
                key = 'Components'
            }

            /* Initialize object if it doesn't exist */
            if (product[key] == '') {
                product[key] = {}
            }
            product[key][component_id] = {'quantity': 1}
        },
        removeProductComponent(product_id, component_id, type) {
            reset_empty = function(components_object) {
                /* Reset empty object to the default value (empty string)*/
                if (Object.keys(components_object).length == 0) {
                    return "";
                } else {
                    return components_object;
                }
            }
            var product = this.all_products[product_id]
            if (type == 'Alternative') {
                delete product['Alternative Components'][component_id]
                product['Alternative Components'] = reset_empty(product['Alternative Components'])
            } else {
                delete product['Components'][component_id]
                product['Components'] = reset_empty(product['Components'])
            }
        },
        cloneComponent(comp_id) {
            component = this.all_components[comp_id]
            new_comp = Object.assign({}, component)
            new_id = this.next_component_id
            new_comp['REF_ID'] = new_id
            this.all_components[new_id] = new_comp
            this.new_components.add(new_id)
            return new_id
        },
        newComponent() {
            new_id = this.next_component_id
            /* Hacky way to be able to avoid typing all keys that a component should contain */
            old_id = parseInt(new_id) - 1
            new_id = this.cloneComponent(old_id)
            new_component = {}

            Object.keys(this.all_components[new_id]).forEach(function(key) {
                switch(key) {
                    case 'REF_ID':
                        new_component[key] = new_id
                        break;
                    case 'Status':
                        new_component[key] = 'Available'
                        break;
                    case 'Currency':
                        new_component[key] = 'SEK'
                        break;
                    default:
                        new_component[key] = ''
                }
            })
            this.all_components[new_id] = new_component
            return new_id
        },
        removeComponent(comp_id) {
            /* meant to be used with new components only */
            delete this.all_components[comp_id]
            delete this.new_components[comp_id]
        },
        // Fetch methods
        fetchDraftCostCalculator(assign_data) {
            axios
                .get('/api/v1/draft_cost_calculator')
                .then(response => {
                    data = response.data.cost_calculator
                    if (data !== null) {
                        this.draft_cost_calculator = data
                        if (assign_data) {
                            this.all_products = data.products
                            this.all_components = data.components
                        }
                    }
                    this.current_user_email = response.data['current_user_email']
                    this.draft_data_loading = false
                })
                .catch(error => {
                    this.error_messages.push('Unable to fetch draft cost calculator data, please try again or contact a system administrator.')
                    this.draft_data_loading = false
                })
        },
        fetchExchangeRates(date) {
            url = '/api/v1/pricing_exchange_rates'
            if (date !== undefined) {
                url += '?date=' + date;
            }
            axios
                .get(url)
                .then(response => {
                    this.USD_in_SEK = response.data.USD_in_SEK
                    this.EUR_in_SEK = response.data.EUR_in_SEK
                    date = new Date(Date.parse(response.data['Issued at']))
                    this.exch_rate_issued_at = date.toLocaleDateString('sv-SE')
                })
                .catch(error => {
                    this.$root.error_messages.push('Unable to fetch exchange rates data, please try again or contact a system administrator.')
                })
        },
        fetchPublishedCostCalculator(assign_data) {
            axios
                .get('/api/v1/cost_calculator')
                .then(response => {
                    data = response.data.cost_calculator
                    if (data !== null) {
                        this.published_cost_calculator = data
                        if (assign_data) {
                            this.all_products = data.products
                            this.all_components = data.components
                        }
                    }
                    this.current_user_email = response.data['current_user_email']
                    this.published_data_loading = false
                })
                .catch(error => {
                    this.$root.error_messages.push('Unable to fetch published cost calculator data, please try again or contact a system administrator.')
                    this.published_data_loading = false
                })
        },
        validate() {
            if (this.all_components !== null && this.all_products !== null) {
                axios.post('/api/v1/pricing_validate_draft', {
                    components: this.all_components,
                    products: this.all_products, 
                    //Will this break validation in the draft cost calculator?
                    version: this.published_cost_calculator["Version"]
                }).then(response => {
                    this.product_changes = response.data.changes['products']
                    this.component_changes = response.data.changes['components']
                    this.validation_msgs = response.data.validation_msgs
                })
                .catch(error => {
                    this.$root.error_messages.push('Unable to validate draft changes, please try again or contact a system administrator.')
                })
            } else {
                /* Case for when the draft is deleted, is being deleted or not yet loaded */
                this.$root.product_changes = Object()
                this.$root.component_changes = Object()
                this.$root.validation_msgs = Object({'products': {}, 'components': {}})
            }
        },
        // Methods to calculate cost
        componentCost(comp_id) {
            component = this.all_components[comp_id]
            currency = component['Currency']
            list_price = component['List price']
            if (currency == 'SEK') {
                sek_list_price = list_price
            } else {
                currency_key = currency + "_in_SEK"
                sek_list_price = this[currency_key] * list_price
            }
            sek_price = sek_list_price - sek_list_price*component['Discount']
            sek_price_per_unit = sek_price/component['Units']

            return {'sek_price': sek_price, 'sek_price_per_unit': sek_price_per_unit}
        },
        productCost(prod_id) {
            product = this.all_products[prod_id]
            if (product['is_fixed_price']) {
                cost = parseFloat(product['fixed_price']['price_in_sek']) || 0
                cost_academic = parseFloat(product['fixed_price']['price_for_academics_in_sek']) || 0
                full_cost = parseFloat(product['fixed_price']['full_cost_in_sek']) || 0
            } else {
                cost = 0
                for ([comp_id, info] of Object.entries(product['Components'])) {
                    componentCosts = this.componentCost(comp_id)
                    quantity = info['quantity']
                    cost += quantity * componentCosts['sek_price_per_unit']
                }
                cost_academic = cost + cost * product['Overhead']

                full_cost_fee = parseFloat(product['Full cost fee']) || 0
                full_cost = cost_academic + full_cost_fee
            }

            return {'cost': cost, 'cost_academic': cost_academic, 'full_cost': full_cost}
        },
        // Other methods
        assignNewItems() {
            /* When loading a draft where new products or components have been added,
             * this will figure out which products and components are 'new'.
             */
            draft_prod_ids = new Set(Object.keys(this.all_products))
            draft_comp_ids = new Set(Object.keys(this.all_components))

            published_prod_ids = new Set(Object.keys(this.published_cost_calculator['products']))
            published_comp_ids = new Set(Object.keys(this.published_cost_calculator['components']))

            new_prod_ids = this.symmetricSetDifference(draft_prod_ids, published_prod_ids)
            new_comp_ids = this.symmetricSetDifference( draft_comp_ids, published_comp_ids)

            for (let new_prod_id of new_prod_ids) {
                this.new_products.add(new_prod_id)
            }

            for (let new_comp_id of new_comp_ids) {
                this.new_components.add(new_comp_id)
            }
        },
        sortComponents(firstComp, secondComp) {
            // Comparison function used to sort components on name within each category
            if (firstComp['Product name'] < secondComp['Product name']) {
                return -1;
            } else if (firstComp['Product name'] > secondComp['Product name']) {
                return 1;
            } else {
                return 0;
            }
        },
        sortComponentsByID(firstComp, secondComp) {
            // Comparison function used to sort components on ID within a category, used for
            // new components
            if (firstComp['ID'] < secondComp['ID']) {
                return -1;
            } else if (firstComp['ID'] > secondComp['ID']) {
                return 1;
            } else {
                return 0;
            }
        },
        sortProducts(firstProd, secondProd) {
            /* Comparison function used to sort products on name within each category
             */
            if (firstProd['Name'] < secondProd['Name']) {
                return -1;
            } else if (firstProd['Name'] > secondProd['Name']) {
                return 1;
            } else {
                return 0;
            }
        },
        sortProductsByID(firstProd, secondProd) {
            /* Comparison function used to sort products on name within each category
             */
            if (firstProd['ID'] < secondProd['ID']) {
                return -1;
            } else if (firstProd['ID'] > secondProd['ID']) {
                return 1;
            } else {
                return 0;
            }
        },
        symmetricSetDifference(setA, setB) {
            /* Convenience method taken from
             * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set
             */
            let _difference = new Set(setA)
            for (let elem of setB) {
                if (_difference.has(elem)) {
                    _difference.delete(elem)
                } else {
                    _difference.add(elem)
                }
            }
            return _difference
        },
        populatedComponents(product_id, type) {
            var product = this.all_products[product_id]
            var components = new Object();
            if (type == 'Alternative') {
                component_input = product['Alternative Components']
            } else {
                component_input = product['Components']
            }
            for ([comp_id, info] of Object.entries(component_input)) {
                components[comp_id] = {
                    'component': this.all_components[comp_id],
                    'quantity': info['quantity']
                }
            }
            return components
        }
    }
}

const app = Vue.createApp(vPricingMain)

/* Reusable components */

app.component('v-exchange-rates', {
  /* Exchange rates used fot the cost calculator and a modal to
   * change dates for when the rates were issued.
   */
  props: ['mutable', 'issued_at'],
  data() {
      return {
          issued_at_form_bound: this.issued_at
      }
  },
  computed: {
      USD_in_SEK() {
          val = this.$root.USD_in_SEK
          if (val === null) {
              return ""
          } else {
              return val.toFixed(2)
          }
      },
      EUR_in_SEK() {
          val = this.$root.EUR_in_SEK
          if (val === null) {
              return ""
          } else {
              return val.toFixed(2)
          }
      }
  },
  watch: {
      issued_at(newVal, oldVal) {
          this.issued_at_form_bound = newVal
      }
  },
  methods: {
    reload_exch_rates() {
        date = this.issued_at_form_bound;
        this.$root.fetchExchangeRates(date);
    }
  },
  template:
      /* Using the html comment tag can enable html syntax highlighting in editors */
      /*html*/`
      <h4>Exchange rates</h4>
      <dl class="row">
        <dt class="col-md-2 text-right">1 USD</dt>
        <dd class="col-md-10"><span id='exch_rate_usd'>{{USD_in_SEK}}</span></dd>
        <dt class="col-md-2 text-right">1 EUR</dt>
        <dd class="col-md-10"><span id='exch_rate_eur'>{{EUR_in_SEK}}</span></dd>
        <dt class="col-md-2 text-right">Issued at</dt>
        <dd class="col-md-10"><span id='exch_rate_issued_at'>{{issued_at}}</span>
          <a v-if="mutable" href="#" data-toggle="modal" data-target="#exch_rate_modal"> (Change)</a>
        </dd>
      </dl>
      <template v-if="mutable">
        <!-- Exchange Rate Modal -->
        <div class="modal fade" id="exch_rate_modal" tabindex="-1" role="dialog" aria-labelledby="myModalLabel">
          <div class="modal-dialog" role="document">
            <div class="modal-content">
              <div class="modal-header">
                <h4 class="modal-title" id="myModalLabel">Fetch historic exchange rate</h4>
                <button type="button" class="btn-close" data-dismiss="modal" aria-label="Close"></button>
              </div>
              <div class="modal-body">
                <p>The most recent rates prior to the date chosen will be used.</p>
                <p>Latest date exchange rates: <input id="datepicker" type='date' v-model="issued_at_form_bound" data-date-format="yyyy-mm-dd"></p>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
                <button id='datepicker-btn' type="button" class="btn btn-primary" @click="reload_exch_rates" data-dismiss="modal">Apply Exchange Rates</button>
              </div>
            </div>
          </div>
        </div>
      </template>
      `,
})

app.component('v-products-table', {
    /* Table listing products - either draft or published.
     * Can optionally:
     *   - show discontinued products
     *   - have buttons to add products to quote
     */
    props: ['show_discontinued', 'quotable'],
    data: function() {
        return {
            dataTable: null
        }
    },
    mounted() {
        this.$nextTick(() => {
            this.init_listjs()
        })
    },
    watch: {
        show_discontinued(new_val, old_val) {
            this.reset_listjs()

            // have to wait for the table to be drawn
            this.$nextTick(() => {
                this.init_listjs()
            })
        }
    },
    methods: {
        init_listjs() {
            /* Just the ordinary datatable initializing. */
            this.dataTable = $('#pricing_products_table').DataTable({
                "paging":false,
                "info":false,
                "order": [[ 1, "asc" ]]
            });

            this.dataTable.columns().every(function() {
                var that = this;
                $('input', this.footer()).on( 'keyup change', function() {
                    that
                        .search(this.value)
                        .draw();
                });
            });

            $('#pricing_products_table_filter').addClass('col-md-2');
            $("#pricing_products_table_filter").appendTo("#table_h_and_search");
            $('#pricing_products_table_filter label input').appendTo($('#pricing_products_table_filter'));
            $('#pricing_products_table_filter label').remove();
            $('#pricing_products_table_filter input').addClass('form-control p-2 mb-2 float-right');
            $("#pricing_products_table_filter input").attr("placeholder", "Search table...");
        },
        reset_listjs() {
            /* A bit hacky way to get datatables to handle a DOM update:
             *  - drop it and recreate it.
             */
            $('#pricing_products_table').DataTable().destroy();
            $('#pricing_products_table_filter').remove();
        }
    },
    template: /*html*/`
      <table class="table table-sm sortable" id="pricing_products_table">
        <thead class="table-light">
          <tr class="sticky">
            <th v-if="quotable">Quoting</th>
            <th class="sort" data-sort="category">Category</th>
            <th class="sort" data-sort="type">Type</th>
            <th class="sort" data-sort="name">Name</th>
            <th calss="sort" data-sort="cost">Cost</th>
            <th class="sort" data-sort="comment">Comment</th>
          </tr>
        </thead>
        <tfoot class="table-light">
          <tr>
            <th v-if="quotable"></th>
            <th class="sort" data-sort="category"><input class="form-control search search-query" type="text" placeholder="Search Category" /></th>
            <th class="sort" data-sort="type"><input class="form-control search search-query" type="text" placeholder="Search Type" /></th>
            <th class="sort" data-sort="name"><input class="form-control search search-query" type="text" placeholder="Search Name" /></th>
            <th calss="sort" data-sort="cost"><input class="form-control search search-query" type="text" placeholder="Search Cost" /></th>
            <th class="sort" data-sort="comment"><input class="form-control search search-query" type="text" placeholder="Search Comment" /></th>
          </tr>
        </tfoot>
        <tbody class="list" id='pricing_products_tbody'>
        <template v-for="product in this.$root.all_products" :key="product['REF_ID']">
            <v-product-table-row :product_id="product['REF_ID']" :quotable="quotable"/>
        </template>
        </tbody>
      </table>
      `
})

app.component('v-product-table-row', {
    /* Individual rows of the product table. */
    props: ['product_id', 'quotable'],
    computed: {
        product() {
            return this.$root.all_products[this.product_id]
        },
        quote_count() {
            if (this.product_id in this.$root.quote_prod_ids) {
                return this.$root.quote_prod_ids[this.product_id]
            } else {
                return 0
            }
        },
        changes() {
            if (this.product_id in this.$root.product_changes) {
                return this.$root.product_changes[this.product_id]
            } else {
                return null
            }
        },
        is_changes() {
            return (this.changes !== null)
        },
        validation_msgs() {
            if (this.product_id in this.$root.validation_msgs['products']) {
                return this.$root.validation_msgs['products'][this.product_id]
            } else {
                return null
            }
        },
        is_invalid() {
            return (this.validation_msgs !== null)
        },
        discontinued() {
            return (this.product['Status'] == 'Discontinued')
        },
        status_css() {
            return 'status_' + this.product['Status'].toLowerCase()
        },
        visible() {
            return (this.$root.show_discontinued || !this.discontinued)
        },
        isNew() {
            return this.$root.new_products.has(this.product_id)
        },
        isFixedPrice() {
            return this.product.is_fixed_price
        },
        categories() {
            return this.$root.product_categories
        },
        types() {
            return this.$root.product_types
        },
        cost() {
            // Returns a {'cost': cost, 'cost_academic': cost_academic, 'full_cost': full_cost}
            return this.$root.productCost(this.product_id)
        }
    },
    methods: {
        add_to_quote(event) {
            event.preventDefault();
            if (!(this.product_id in this.$root.quote_prod_ids)) {
                this.$root.quote_prod_ids[this.product_id] = 0
            }
            this.$root.quote_prod_ids[this.product_id] += 1
        }
    },
    template: /*html*/`
        <template v-if="this.visible">
          <tr :id="'product_form_part_' + product_id" class="status_css link-target-offset-extra" :class="{'table-danger pricing-tr-is-invalid': is_invalid, 'table-warning': discontinued, 'table-success pricing-tr-changed': is_changes}">
            <td v-if="quotable">
              <a href="#" class="button add-to-quote" :data-product-id="product['REF_ID']" @click="add_to_quote"><i class="far fa-plus-square fa-lg"></i></a>
              <span>({{quote_count}})</span>
            </td>
            <v-product-table-row-td td_key='Category' :row_changes="this.changes" :product_id="this.product_id"/>
            <v-product-table-row-td td_key='Type' :row_changes="this.changes" :product_id="this.product_id"/>
            <v-product-table-row-td td_key='Name' :row_changes="this.changes" :product_id="this.product_id"/>
            <v-product-table-row-td td_key='Cost' :row_changes="this.changes" :product_id="this.product_id" :quotable="quotable"/>
            <v-product-table-row-td td_key='Comment' :row_changes="this.changes" :product_id="this.product_id"/>
          </tr>
        </template>
    `
})

app.component('v-product-table-row-td',  {
    /* Indivudal <td> for product table (not all of them) */
    props: ['td_key', 'row_changes', 'product_id', 'quotable'],
    data() {
        return { tooltip: null }
    },
    computed: {
        is_changes() {
             return ((this.row_changes !== null) && (this.td_key in this.row_changes))
        },
        changes() {
            if (this.row_changes !== null) {
                return this.row_changes[this.td_key]
            } else {
                return null
            }
        },
        is_components() {
            return (['Components', 'Alternative Components'].indexOf(this.td_key) !== -1)
        },
        is_regular_components() {
            return this.td_key == 'Components'
        },
        is_alternative_components() {
            return this.td_key == 'Alternative Components'
        },
        product() {
            return this.$root.all_products[this.product_id]
        },
        cost() {
            // Returns a {'cost': cost, 'cost_academic': cost_academic, 'full_cost': full_cost}
            return this.$root.productCost(this.product_id)
        },
        tooltip_html() {
            if (this.is_changes) {
                return_html = '<div class="row pricing-td-highlight-tooltip"><div class="col-5">'
                arrow_element = '</div><div class="col-2 d-flex align-self-center px-0"><h5><i class="fas fa-arrow-right"></i></h5></div>'
                if (typeof this.changes[0] == 'string') {
                    return_html += `<p>${this.changes[1]}</p>`
                    return_html += arrow_element
                    return_html += '<div class="col-5">'
                    return_html += `<p>${this.changes[0]}</p>`
                    return_html += '</div></div>'
                    return return_html
                } else {
                    for ([prod_id, quantity_data] of Object.entries(this.changes[1])) {
                        return_html += '<p>' + quantity_data['quantity'] + ' x ' + this.$root.all_components[prod_id]['Product name'] + '</p>'
                    }
                    return_html += arrow_element
                    return_html += '<div class="col-5">'
                    for ([prod_id, quantity_data] of Object.entries(this.changes[0])) {
                        return_html += '<p>' + quantity_data['quantity'] + ' x ' + this.$root.all_components[prod_id]['Product name'] + '</p>'
                    }
                    return_html += '</div></div>'
                    return return_html
                }
            }
        }
    },
    watch: {
        changes(newVal, oldVal) {
            if (this.is_changes) {
                this.tooltip = new bootstrap.Tooltip(this.$el)
            }
        }
    },
    template: /*html*/`
        <td :class="{'pricing-td-changed': is_changes}" data-toggle="tooltip" data-placement="top" :data-original-title="tooltip_html" data-animation=false data-html=true>
          <template v-if="is_components">
            <template v-if="this.td_key == 'Components'">
              <v-product-table-components :product_id="product_id" :type="'Regular'" :is_changes="is_changes"/>
            </template>
            <template v-else>
              <v-product-table-components :product_id="product_id" :type="'Alternative'" :is_changes="is_changes"/>
            </template>
          </template>
          <template v-else>
            <template v-if="this.td_key == 'Cost'">
                <ul v-if="quotable===false || this.$root.price_type ==='cost_academic'" class="list-group list-group-horizontal">
                    <li class="list-group-item col-7">Academic</li>
                    <li class="list-group-item col-4">{{ cost['cost_academic'].toFixed(2) }}</li>
                </ul>
                <ul v-if="quotable===false || this.$root.price_type ==='full_cost'" class="list-group list-group-horizontal">
                    <li class="list-group-item col-7">Industry and Non Swedish Academia</li>
                    <li class="list-group-item col-4">{{ cost['full_cost'].toFixed(2)  }} </li>
                </ul>
                <ul v-if="quotable===false || this.$root.price_type ==='cost'" class="list-group list-group-horizontal">
                    <li class="list-group-item col-7">Internal</li>
                    <li class="list-group-item col-4">{{ cost['cost'].toFixed(2) }}</li>
                </ul>
            </template>
            <template v-else>
                <p>{{product[td_key]}}</p>
            </template>
          </template>
        </td>
        `
    });

app.component('v-product-table-components', {
    /* The <td> of the product table with the list of components or alternative components */
    props: ['product_id', 'type', 'is_changes'],
    computed: {
        product() {
            return this.$root.all_products[this.product_id]
        },
        componentIds() {
            if (this.type == 'Alternative') {
                return Object.keys(this.product['Alternative Components'])
            } else {
                return Object.keys(this.product['Components'])
            }
        },
        components() {
            return this.$root.populatedComponents(this.product['REF_ID'], this.type)
        },
        is_empty() {
            return (this.componentIds.length == 0)
        },
    },
    template: /*html*/`
        <template v-if="is_changes && is_empty">
          <h4><i class="fas fa-exclamation-triangle"></i></h4>
        </template>
        <template v-else>
          <template v-for="(component_data, comp_id) in components" :key="comp_id">
            <div>{{component_data['component']['Product name']}}</div>
          </template>
        </template>
      `
})

app.component('v-draft-changes-list', {
    /* A list of changes in the draft compared to the latest published cost calculator.
     *   - Slightly modified look if it is placed in a modal
     */
    props: ['modal', 'modal_id'],
    computed: {
        product_changes() {
            return this.$root.product_changes
        },
        component_changes() {
            return this.$root.component_changes
        },
        no_changes() {
            return (Object.keys(this.product_changes).length === 0) && (Object.keys(this.component_changes).length === 0)
        }
    },
    methods: {
        is_new_product(prod_id) {
            prod_changes_data = this.product_changes[prod_id]
            if (Object.keys(prod_changes_data).length !== 0) {
                return (Object.keys(prod_changes_data)[0] == 'All')
            } else {
                return false
            }
        },
        is_new_component(comp_id) {
            comp_changes_data = this.component_changes[comp_id]
            if (Object.keys(comp_changes_data).length !== 0) {
                return (Object.keys(comp_changes_data)[0] == 'All')
            } else {
                return false
            }
        },
        scroll_to_on_page(event) {
            event.preventDefault();
            destination = event.target.dataset.scrollToLink

            scroll_to = function(dest) {
                window.location.href = '#'
                window.location.href = dest
            }
            if (this.modal) {

                var myModalEl = document.getElementById(this.modal_id)
                var modal = bootstrap.Modal.getInstance(myModalEl) // Returns a Bootstrap modal instance
                myModalEl.addEventListener('hidden.bs.modal', function (event) {
                    scroll_to(destination)
                })
                modal.hide();
            } else {
                scroll_to(destination)
            }
        }
    },
    template: /*html*/`
      <div v-if="no_changes" class="my-2">
        <h4>No changes between draft and published document.</h4>
      </div>
      <div v-else class="my-3 card">
        <div class="card-header">
          <a class="pricing_collapse_link" data-toggle="collapse" data-target="#changes_card_body" role="button" aria-expanded="true" aria-controls="#changes_card_body">
            <h4>Changes made: <i class="fas fa-caret-down fa-lg pl-1"></i></h4>
          </a>
        </div>
        <div class="card-body collapse show" id="changes_card_body">
          <div class="row">
            <div :class="modal ? 'col-12' : 'col-6'">
              <h4>Products</h4>
              <div class="row">
                <template v-for="(prod_changes_data, prod_id) in product_changes" :key="prod_id">
                  <div class="ml-3 mb-3">
                    <h5 class="col-12">
                      <a href='#' :data-scroll-to-link="'#product_form_part_' + prod_id" @click="scroll_to_on_page">
                        {{this.$root.all_products[prod_id]['Name']}}:
                      </a>
                      <template v-if="is_new_product(prod_id)">
                        <strong class="ml-2"> - New product!</strong>
                      </template>
                    </h5>
                    <template v-if="is_new_product(prod_id)">
                      <div class="ml-3 mr-2">
                        <div v-for="(new_prod_value, new_prod_key) in prod_changes_data['All'][0]" :key="new_prod_key">
                          <strong>{{new_prod_key}}:</strong> {{new_prod_value}}
                        </div>
                      </div>
                    </template>
                    <template v-else>
                      <div class="ml-3 mr-2" v-for="(prod_type_changes_data, type_key) in prod_changes_data" :key="type_key">
                        <strong class="mr-2">{{type_key}}:</strong>
                        <template v-if="(type_key == 'Components') || (type_key == 'Alternative Components')">
                        <div class="row">
                          <div class="col-4 border-right">
                            <div class="row" v-for="(prod_type_component_changes_data, component_id) in prod_type_changes_data[1]" :key="component_id">
                              <div class="col-3 ml-3">
                                <a href=""><span class="badge bg-secondary pricing_hoverable" :title="this.$root.all_components[component_id]['Product name']">{{component_id}}</span></a>
                              </div>
                              <div class="col-8">
                                Quantity: {{prod_type_component_changes_data['quantity']}}
                              </div>
                            </div>
                          </div>
                          <div class="col-auto d-flex align-items-center pl-1 pr-0">
                            <i class="fas fa-arrow-right"></i>
                          </div>
                          <div class="col-4">
                            <div class="row" v-for="(prod_type_component_changes_data, component_id) in prod_type_changes_data[0]" :key="component_id">
                              <div class="col-3 ml-2">
                                <span class="badge bg-success pricing_hoverable" :title="this.$root.all_components[component_id]['Product name']">{{component_id}}</span>
                              </div>
                              <div class="col-8">
                                Quantity: {{prod_type_component_changes_data['quantity']}}
                              </div>
                            </div>
                          </div>
                        </div>
                        </template>
                        <template v-else>
                          {{prod_type_changes_data[1]}} <i class="fas fa-arrow-right"></i> {{prod_type_changes_data[0]}}
                        </template>
                      </div>
                    </template>
                  </div>
                </template>
              </div>
            </div>
            <div :class="modal ? 'col-12' : 'col-6 border-left'">
              <h4>Components</h4>
              <div class="row">
                <template v-for="(comp_changes_data, comp_id) in component_changes" :key="comp_id">
                  <div class="ml-3 mb-3">
                    <h5 class="col-12">
                      <a href='#' :data-scroll-to-link="'#component_form_part_' + comp_id" @click="scroll_to_on_page">
                        {{this.$root.all_components[comp_id]['Product name']}}:
                      </a>
                      <template v-if="is_new_component(comp_id)">
                        <strong class="ml-2"> - New component!</strong>
                      </template>
                    </h5>
                    <template v-if="is_new_component(comp_id)">
                      <div class="ml-3 mr-2">
                        <div v-for="(new_comp_value, new_comp_key) in comp_changes_data['All'][0]" :key="new_comp_key">
                          <strong>{{new_comp_key}}:</strong> {{new_comp_value}}
                        </div>
                      </div>
                    </template>
                    <template v-else>
                      <div class="ml-3 mr-2" v-for="(comp_type_changes_data, type_key) in comp_changes_data" :key="type_key">
                        <strong class="mr-2">{{type_key}}:</strong>
                        {{comp_type_changes_data[1]}} <i class="fas fa-arrow-right"></i> {{comp_type_changes_data[0]}}
                      </div>
                    </template>
                  </div>
                </template>
              </div>
            </div>
          </div>
        </div>
      </div>
      `
})


app.component('v-draft-validation-msgs-list', {
    /* A list of validation errors in the draft compared to the latest published cost calculator.
     *   - Slightly modified look if it is placed in a modal
     */
    props: ['modal', 'modal_id'],
    computed: {
        product_messages() {
            return this.$root.validation_msgs['products']
        },
        component_messages() {
            return this.$root.validation_msgs['components']
        },
        any_messages() {
            return (Object.keys(this.product_messages).length !== 0) || (Object.keys(this.component_messages).length !== 0)
        }
    },
    methods: {
        scroll_to_on_page(event) {
            event.preventDefault();
            destination = event.target.dataset.scrollToLink
            scroll_to = function(dest) {
                window.location.href = '#'
                window.location.href = dest
            }
            if (this.modal) {

                var myModalEl = document.getElementById(this.modal_id)
                var modal = bootstrap.Modal.getInstance(myModalEl) // Returns a Bootstrap modal instance
                myModalEl.addEventListener('hidden.bs.modal', function (event) {
                    scroll_to(destination)
                })
                modal.hide();
            } else {
                scroll_to(destination)
            }
        }
    },
    template: /*html*/`
      <div v-if="any_messages" class="my-3 card border-danger">
        <div class="card-header">
          <a class="pricing_collapse_link" data-toggle="collapse" data-target="#validation_msgs_card_body" role="button" aria-expanded="true" aria-controls="#validation_msgs_card_body">
            <h4><span class="badge bg-danger"><i class="fas fa-exclamation-triangle mr-2"></i>Validation errors:</span> <i class="fas fa-caret-down fa-lg pl-1"></i></h4>
          </a>
        </div>
        <div class="card-body collapse show" id="validation_msgs_card_body">
          <div class="row">
            <div :class="modal ? 'col-12' : 'col-6'">
              <h4>Products</h4>
              <div class="row pr-4">
                <template v-for="(prod_validation_msgs_data, prod_id) in product_messages" :key="prod_id">
                  <div class="ml-3 mb-3">
                    <h5 class="col-12"><a href='#' :data-scroll-to-link="'#product_form_part_' + prod_id" @click="scroll_to_on_page">{{this.$root.all_products[prod_id]['Name']}}:</a></h5>
                    <div class="ml-3" v-for="(prod_type_validation_msgs_data, type_key) in prod_validation_msgs_data" :key="type_key">
                      <ul v-for="validation_msg in prod_type_validation_msgs_data">
                        <li class="fs-5">{{validation_msg}}</li>
                      </ul>
                    </div>
                  </div>
                </template>
              </div>
            </div>
            <div :class="modal ? 'col-12' : 'col-6'">
              <h4>Components</h4>
              <div class="row pr-4">
                <template v-for="(comp_validation_msgs_data, comp_id) in component_messages" :key="comp_id">
                  <div class="ml-3 mb-3">
                    <h5 class="col-12"><a href="#" :data-scroll-to-link="'#component_form_part_' + comp_id" @click="scroll_to_on_page">{{this.$root.all_components[comp_id]['Product name']}}:</a></h5>
                    <div class="ml-3" v-for="(comp_type_validation_msgs_data, type_key) in comp_validation_msgs_data" :key="type_key">
                      <ul v-for="validation_msg in comp_type_validation_msgs_data">
                        <li class="fs-5">{{validation_msg}}</li>
                      </ul>
                    </div>
                  </div>
                </template>
              </div>
            </div>
          </div>
        </div>
      </div>
      `
})

app.component('v-pricing-data-loading', {
    /* A div with a bootstrap spinner. */
    template: /*html*/`
      <div class="spinner-grow" role="status"></div><span class="ml-3">Loading data...</span>`
 })

 app.component('v-pricing-error-display', {
     /* A list of error messages */
     template: /*html*/`
       <template v-for="msg in this.$root.error_messages">
         <div class="alert alert-danger" role="alert">
           <h5 class="mt-2"><i class="far fa-exclamation-triangle mr-3"></i>{{msg}}</h5>
         </div>
       </template>`
  })
