/*
File: project_samples.js
URL: /static/js/project_samples.js
Powers /project/[PID] - template is run_dir/design/project_samples.html
*/

// Get pseudo-argument for this js file. Ie, project = P1234
var project = $('#projects-js').attr('data-project');
var lims_uri = $('#projects-js').attr('data-lims_uri');
var ordered_reads = 0.0;
$(document).ready(function() {

  // Initialise everything - order is important :)
  $.when(load_presets()).done(function(){
    load_all_udfs();
    //load_samples_table();
    select_from_preset('default_preset_buttons', 'Default view');
    load_running_notes();
    load_links();
    load_charon_summary();
  });

  // Prevent traditional html submit function
  $('#Search-form').submit(function(e){
    e.preventDefault();
  });

  // Copy email address to clipboard and change the tooltip
  var email_clipboard = new Clipboard('.email_link a');
  email_clipboard.on('success', function(e) {
    $('.email_link').attr('title', 'Copy to clipboard').tooltip('_fixTitle');
    $(e.trigger).parent().attr('title', 'Copied!').tooltip('_fixTitle').tooltip('show');
  });

  $('body').on('click', '.search-action', function(e) {
    // Stop the checkbox from firing if clicked, plus stop bubbling
    e.stopPropagation();
    switch ($(this).data('action')) {
      case 'filterReset':
        reset_default_checkboxes();
        break;
      case 'filterApply':
        load_samples_table();
        break;
      case 'filterHeader':
        choose_column($(this).parent().attr("id"));
        break;
      case 'filterPresets':
        select_from_preset($(this).parent().attr('id'), $(this).text());
        break;
    }
  });

  //Show user communication tab. Loading
  $('#tab_communication').click(function (e) {
    load_tickets();
  });

  // Caliper buttons click listener
  $("body").on('click', '.caliper-thumbnail',  function(e) {
      e.preventDefault();
      loadCaliperImageModal('#'+$(this).attr('id'));
  });
  $('#caliperModal .right, #caliperModal .left').click(function(e){
    e.preventDefault();
    loadCaliperImageModal($(this).attr('href'));
  })
    $('#charon_link_button').click(function(){
          window.open(this.href);
      return false;
        });
    $('.copy_proj').click(function(){
        var copyText = project;
        document.addEventListener('copy', function(e) {
            e.clipboardData.setData('text/plain', copyText);
            e.preventDefault();
        }, true);
        document.execCommand('copy');
        window.open(this.href);
      return false;
    });
  if(window.location.href.indexOf('#running_note_')!=-1){
    $('.nav-tabs a[href="#tab_running_notes_content"]').tab('show');
    setTimeout(function(){
      window.location.href = window.location.hash;
      window.scrollTo(window.scrollX, window.scrollY - 53);
      var elem_to_glow = $('a[href="'+window.location.hash+'"]').parents().eq(1);
      elem_to_glow.addClass('glow').delay(3000).queue(function(){elem_to_glow.removeClass('glow')});
    }, 2000)
  }
});

function init_datatable() {
  // Setup - add a text input to each footer cell
  $('#sample_table tfoot th').each( function () {
    var title = $('#sample_table thead th').eq( $(this).index() ).text();
    $(this).html( '<input size=10 type="text" placeholder="Search '+title+'" />' );
  } );

    var table = $('#sample_table').DataTable({
      "paging":false,
      "destroy": true,
      "info":false,
      "order": [[ 0, "asc" ]],
      dom: 'Bfrti',
      buttons: [
        { extend: 'copy', className: 'btn btn-outline-dark mb-3' },
        { extend: 'excel', className: 'btn btn-outline-dark mb-3' }
      ]
    });
  //Add the bootstrap classes to the search thingy
  $('div.dataTables_filter input').addClass('form-control search search-query');
  $('#sample_table_filter').addClass('form-inline');
  $("#sample_table_filter").appendTo("#search_field");
  $('#sample_table_filter label input').appendTo($('#sample_table_filter'));
  $('#sample_table_filter label').remove();
  $("#sample_table_filter input").attr("placeholder", "Search...");
  // Apply the search
  table.columns().every( function () {
      var that = this;
      $( 'input', this.footer() ).on( 'keyup change', function () {
          that
          .search( this.value )
          .draw();
      });
  });
  $(".dt-buttons > .buttons-copy").prepend("<span class='mr-1 fa fa-copy'>");
  $(".dt-buttons > .buttons-excel").prepend("<span class='mr-1 fa fa-file-excel'>");
}

////////////////////////////////////
// Choose columns related methods //
////////////////////////////////////


function read_current_filtering(header){
  /*   If header == False, this will return only an array of pairs [display_name, column_id]

  If header == True, this will return an array representing with the column grouping as an extra value in the array
  */
  var columns = new Array();
  $("#Filter .filterCheckbox:checked").each(function() {
    if (header){
      columns.push([$(this).data('displayname'), $(this).attr('name'), $(this).data('columngroup')]);
    } else {
      columns.push([$(this).data('displayname'), $(this).attr('name')]);
    }
  });
  return columns;
}

function reset_default_checkboxes(){
  $('#Filter input').prop('checked', false); // uncheck everything
  $('#basic-columns input').prop('checked', true); // check the 'basic' columns
  $('#default_view').addClass('active');
}

//Check or uncheck all fields from clicked category
function choose_column(col){
  // If any are checked, uncheck all
  if(safeobj(col).find('input.filterCheckbox:checked').length > 0){
    safeobj(col).find('input').prop('checked', false);
  }
  // Nothing checked - check everything
  else {
    safeobj(col).find('input').prop('checked', true);
  }
}
// Update the header checkbox when clicking in the list
$('#Filter').on('click', '.filterCheckbox', function(){
  var group = $(this).closest('.col-sm-4');
  if(group.find('input.filterCheckbox:checked').length == 0){
    group.find('.headingCheckbox').prop('checked', false);
  } else {
    group.find('.headingCheckbox').prop('checked', true);
  }
});


////////////////////////////////
// Presets related functions  //
///////////////////////////////

function load_presets() {
  return $.getJSON('/api/v1/presets?presets_list=sv_presets', function (data) {
    var default_presets = data['default'];
    var user_presets = data['user'];

    // Empty previously filled lists of presets
    $('#default_preset_buttons').empty();
    $('#user_presets_dropdown').empty();

    // Default presets
    for (var preset in default_presets) {
      $('#default_preset_buttons').append('<button id="'+prettify(preset)+'" data-action="filterPresets" type="button" class="search-action btn btn-outline-secondary">'+preset+'</button>');
    }
    // User presets, if there are any
    if (!jQuery.isEmptyObject(user_presets)) {
      for (var preset in user_presets) {
        $('#user_presets_dropdown').append('<button id="'+prettify(preset)+'" data-action="filterPresets" type="button" class="search-action btn btn-outline-secondary">'+preset+'</button>');
      }
    }
    else {
      $('#user_presets_dropdown').append('No user presets');
    }

    // Check default checkboxes
    if (!$("#Filter :checked").length) {
      reset_default_checkboxes();
    }

  });
}


function select_from_preset(preset_type, preset) {
  $.getJSON('/api/v1/presets?presets_list=sv_presets', function (data) {

    //First uncheck everything
    $('#default_preset_buttons button.active').removeClass('active');
    $('#Filter input:checkbox').prop('checked', false);
    if (preset_type == "default_preset_buttons") {
      var choices = data['default'][preset];
      var colOrder = {};
      if('COLUMNORDER' in choices)
        colOrder = choices['COLUMNORDER'];
      for (column in choices) {
        if(column!='COLUMNORDER')
          for (choice in choices[column]) {
            var column_id = column.toLowerCase().replace(/_/g, '-') + '-' + choice;
            prettyobj(column_id).prop('checked', choices[column][choice]);
          }
      }
      prettyobj(preset).addClass('active');

    } else if (preset_type == "users_presets_dropdown") {
      // TODO - implement this
    }

    // Apply the filter
    load_samples_table(colOrder);
  });
}

function load_tickets() {
  if ($('#com_accordion').children().length == 0) {

    //Get the project name from the header of the page
    var p_name = $("#project_name").attr('p_name');

    $.getJSON("/api/v1/project/" + project + "/tickets?p_name=" + p_name, function(data){

      if ($.isEmptyObject(data)) {
        $('#tab_com_content').html('<div class="alert alert-info">No Zendesk tickets available for ' + p_name + '</div>');
      } else {
        // Javascript Object order is not guaranteed, but we want to show the
        // most recent issued ticket first
        $.each(Object.keys(data).reverse(), function(_, k) {
          var v = data[k];

          var label_class = 'secondary';
          if(v['status'] == 'open'){ label_class = 'danger'; v['status'] = 'Open'; }
          if(v['status'] == 'pending'){ label_class = 'info'; v['status'] = 'Pending'; }
          if(v['status'] == 'on-hold' || v['status'] == 'hold'){ label_class = 'warning'; v['status'] = 'On-Hold'; }
          if(v['status'] == 'solved'){ label_class = 'success'; v['status'] = 'Solved'; }
          if(v['status'] == 'closed'){ label_class = 'success'; v['status'] = 'Closed'; }
          var title = '<span class="float-right">'+
                         '<a class="text-muted text-decoration-none" data-toggle="collapse" data-parent="#com_accordion" href="#zendesk_ticket_'+k+'">'+
                           v['created_at'].split('T')[0] +
                         '</a> &nbsp; <a href="https://ngisweden.zendesk.com/agent/#/tickets/'+k+'" target="_blank" class="btn btn-primary btn-sm">View ticket on ZenDesk</a>'+
                      '</span>' +
                      '<h4 class="card-title mb-0">'+
                        '<span class="badge bg-' + label_class + '">' + v['status'] + '</span> ' +
                        '<a class="text-decoration-none text-dark" data-toggle="collapse" data-parent="#com_accordion" href="#zendesk_ticket_'+k+'">'+
                          '#'+k + ' - ' + v['subject'] +
                        '</a>'+
                      '</h4>';

          var ticket = '<div class="card my-2">' +
                        '<div class="card-header">'+title+'</div>'+
                        '<div id="zendesk_ticket_'+k+'" class="collapse"><div class="card-body">';

          v['comments'].reverse();
          $.each(v['comments'], function(k, c){
            var panel_class = 'card-warning';
            var panel_label = ' &nbsp; <span class="badge bg-warning">Internal</span>';
            if (c['comment']['public']) {
              panel_class = 'bg-light';
              panel_label = '';
            }
            var updated_at = new Date(c['comment']['created_at']);
            ticket += '<div class="card zendesk-ticket mb-2">'+
                        '<div class="card-header '+panel_class+'">'+c['author']+ ' - '+updated_at.toGMTString() + panel_label + '</div>'+
                        '<div class="card-body"><pre style="white-space: pre-wrap; word-break: keep-all;">'+make_markdown(c['comment']['body'])+'</pre></div>'+
                      '</div>';

          });
          $('#com_accordion').append(ticket);
        });
      }

      // Hide the loading modal
      $('#zendesk_loading_spinner').hide();
      $('#com_accordion').show();

    }).fail(function( jqxhr, textStatus, error ) {
        var err = textStatus + ", " + error;
        console.log( "ZenDesk tickets request failed: " + err );
    });
  }
}


function load_all_udfs(){
  return $.getJSON("/api/v1/project_summary/" + project, function (data) {
    $('#loading_spinner').hide();
    $('#page_content').show();

    // Project not found
    if(Object.getOwnPropertyNames(data).length == 0){
      $('#page_content').html('<h1>Error - Project Not Found</h1><div class="alert alert-danger">Oops! Sorry about that, we can\'t find the project <strong>'+project+'</strong></div>');
      return false;
    }

    $.each(data, function(key, value) {
      // Rename a few fields to something more sane
      if(key == 'Aborted'){ key = 'aborted_samples'; }
      if(key == 'In Progress'){ key = 'in_progress_samples'; }
      if(key == 'Finished'){ key = 'finished_samples'; }
      if(key == 'uppnex_id'){ key = 'delivery_type'; }

      //fill in link to statusdb
      $("#statusdb_link").attr('href', data['sourcedb_url']+"/_utils/index.html?projects#database/projects/" + data['_doc_id']);

      // Set the project name and status
      if (prettify(key) == 'project_name'){
        let priority_badge = ""
        if(data['priority']==="High"){
          priority_badge = "<span class='badge bg-danger mr-2 align-text-top'> Priority <span class='fa-solid fa-flag fa-sm'></span></span>"
        }
        if (!data['portal_id']) {
          project_title = project + ", " + data['project_name'] + " <small class='text-muted'>"+ priority_badge+" (" + data['customer_project_reference'] + " - no order in NGI portal)</small>";
        } else {
          project_title = project + ", " + data['project_name'] + ' &nbsp; <small class="text-muted">'+ priority_badge+' NGI Portal: <a class="text-decoration-none" href="https://ngisweden.scilifelab.se/orders/order/' + data['portal_id'] + '" target="_blank">' + data['customer_project_reference'] + '</a></small>';
        }
        prettyobj(key).html(project_title);
        prettyobj(key).attr('p_name', data['project_name']);

        // Decide project status (and color) based on the project dates
        var open_date = data["open_date"];
        var queue_date = data["queued"];
        var close_date = data["close_date"];
        var aborted = data["aborted"];
        var source = data["source"];
        if (aborted){
          $("#project_status_alert").addClass("bg-danger").text("Aborted");
        }
        else {
          if (close_date){
            $("#project_status_alert").addClass("bg-success").text("Closed");
          }
          else if (queue_date && !close_date) {
            $("#project_status_alert").addClass("bg-info").text("Ongoing");
          }
          else if (open_date && !queue_date) {
            $("#project_status_alert").addClass("bg-secondary").text("Reception Control");
          }
          else if (!open_date && source == 'lims'){
            $("#project_status_alert").addClass("bg-info").text("Pending");
          }
          else {
            $("#project_status_alert").addClass("bg-info").text("Status unknown");
          }
          $("#project_status_alert").addClass("align-text-top")
          // Hide the aborted dates
          $('.aborted-dates').hide();
        }
      }

      // Make the project emails clickable and add labels.
      else if (prettify(key) == 'contact'){
        function elabel(text, label) {
          return '<span class="badge bg-'+label+'">'+text+'</span>'
        }
        function validateEmail(email) {
          var cap_email = null;
          // Stolen, without shame, from https://stackoverflow.com/a/46181
          var re = /(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))/;
          if (email){
               matches = email.match(re);
               if (matches){
                  cap_email = matches[0].toLowerCase();
               }
          }
          return cap_email;
        }

        var email_html = '';
        var emails = {}
        try {
          var contact = validateEmail(data['order_details']['owner']['email']);
          if(!contact) {throw 'TypeError';}
          emails[contact] = [elabel('Requester', 'secondary')];
          var lab = validateEmail(data['order_details']['fields']['project_lab_email']);
          if(!emails[lab]){emails[lab]=[elabel('Lab', 'secondary')]} else{emails[lab].push(elabel('Lab', 'secondary'))};
          var bx = validateEmail(data['order_details']['fields']['project_bx_email']);
          if(!emails[bx]){emails[bx]=[elabel('Bioinfo', 'secondary')]} else {emails[bx].push(elabel('Bioinfo', 'secondary'))};
          var pi = validateEmail(data['order_details']['fields']['project_pi_email']);
          if(!emails[pi]){emails[pi]=[elabel('PI', 'info')]} else {emails[pi].push(elabel('PI', 'info'))};
        }
        catch(error) {
          console.log('Falling back to using doc["contact"]');
          emails[value] = [elabel('Contact', 'info')];
        }
        Object.keys(emails).forEach(function(k, i) {
          if (k != 'null') {
            email_html += '<ul class="list-inline email_list">';
            email_html += '<li class="email_link" data-toggle="tooltip" data-placement="left" title="Copy to clipboard">';
            email_html += '<a class="text-decoration-none" href="javascript:void(0);" data-clipboard-text="'+k+'">'+k+'</a></li>';
            email_html += '<li class="email_labels">'+emails[k].join("")+'</li></ul>';
          }
        });
        $('#contact').html(email_html);
      }

      // Colour code the project type
      else if (prettify(key) == 'type'){
        if(value == 'Production'){
          $('#type').html('<span class="badge bg-primary">'+value+'</span>');
        } else if(value == 'Application'){
          $('#type').html('<span class="badge bg-success">'+value+'</span>');
        } else {
          $('#type').html('<span class="badge bg-secondary">'+value+'</span>');
        }
      }

      else if (prettify(key) == 'application'){
        if (value !== null){
          $('#application').html(value);
        }
      }

      // Hide the BP Date if no BP
      else if (prettify(key) == 'best_practice_bioinformatics' && value == 'No'){
        $('.bp-dates').hide();
        safeobj(key).html(auto_format(value));
      }

      // highlight if project is shared
      else if (prettify(key) == 'shared') {
        if (value != 'No') {
          $('#type').append('<span class="badge bg-warning">Shared</span>');
        }
      }

      // Make the comments render Markdown and make project IDs into links
      else if (prettify(key) == 'project_comment'){
        value = value.replace(/\_/g, '\\_');
        $('#project_comment').html(make_markdown(value));
        check_img_sources($('#project_comment img'));
      }
      else if (prettify(key) == 'latest_sticky_note'){
        // do nothing in the future: if we don't catch this the old projdb value will overwrite the run_note_db value
      }

      // Create the links for review and display the banner
      else if (prettify(key) == 'pending_reviews'){
        $("#review_ids").html(value);
        $("#review_alert").show();
      }

      // Pass / Fail sample counts
      else if (prettify(key) == 'passed_initial_qc' || prettify(key) == 'passed_library_qc'){
        var parts = value.split('/');
        if(parts[0].replace(/\D/g,'').length > 0 && parts[1].replace(/\D/g,'').length > 0){
          if(parts[0].replace(/\D/g,'') < parts[1].replace(/\D/g,'')){
            safeobj(key).html('<span class="badge bg-danger">'+value+'</span>');
          } else if(parts[0].replace(/\D/g,'') >= parts[1].replace(/\D/g,'')){
            safeobj(key).html('<span class="badge bg-success">'+value+'</span>');
          }
        } else {
          safeobj(key).html('<span class="badge bg-secondary">'+value+'</span>');
        }
      }
      // Make the user comments render Markdown
      else if (prettify(key) == 'customer_project_description'){
        $('#customer_project_description').html(make_markdown(value));
      }
      // Add last modified time of project
      else if (prettify(key) == 'modification_time'){
        var time = moment(value).format('HH:mm, MMM Do YYYY');
        $("#last_update").html(time);
      }
      else if(prettify(key) == 'project_summary_links'){
        value.forEach(function(summary){
          $("#project_summary_link_dropdown>ul").append('<li><a class="dropdown-item" href="'+ lims_uri +summary[0]+'" target="_blank"> Created: '+summary[1]+'</a></li>');
        });
      }
      // Everything else
      else {
			  if(prettyobj(key).length > 0){
					prettyobj(key).html(auto_format(value));
				} else if(safeobj(key).length > 0){
			  	safeobj(key).html(auto_format(value));
				} else {
					// console.log("Can't find field for "+key+': '+value+' (prettified key: '+prettify(key)+')');
				}
      }
    });

		// Check that we haven't hidden any fields that have content
		if($('#best_practice_analysis_completed').text() != '-'){
			$('.bp-dates').show();
		}
		if($('#aborted').text() != '-'){
			$('.aborted-dates').show();
		}

    // Everything has loaded - fix the missing 'days in production' if we can
    if($('#days_in_production').text() == '-' &&
        $('#open_date').text() != '-' &&
        $('#close_date').text() != '-'){

      var openDate = new Date($('#open_date').text());
      var closeDate = new Date($('#close_date').text());
      var timeDiff = Math.abs(closeDate.getTime() - openDate.getTime());
      var diffDays = Math.ceil(timeDiff / (1000 * 3600 * 24));
      $('#days_in_production').text(diffDays);

    }

    // Make the page title reflect the page contents
    // Long string of functions is to remove <small>NGI Portal</small> text..
    document.title = $("#project_name").attr('p_name') + ' : Genomics Status';

		// Make the cool timescale bar if we can
		make_timescale('order');

    // Warn users about old projects
    old_project_warning('2010-07-1');

    // Check the height of the user comment
    check_fade_height();
  }).fail(function( jqxhr, textStatus, error ) {
      var err = textStatus + ", " + error;
      console.log( "Couldn't load all udfs: " + err );
      $('#page_content').html('<h1>Error - Project Not Found</h1><div class="alert alert-danger">Oops! Sorry about that, we can\'t find the project <strong>'+project+'</strong></div>');
  });
};

function prettify(s, nospecialchars) {
  // Replaces whitespace with underscores. Replaces sequential _s with one
  // Removes trailing underscores
  if(typeof nospecialchars !== 'undefined' && nospecialchars == true){
    s = s.replace(/\W+/g, "");
  }
  s = s.toLowerCase().replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^_/, "").replace(/_$/, "");
  return s
}

// These functions avoid parsing errors due to jQuery not liking element
// IDs with brackets in. Otherwise eqivalent to $('#'+s)
function prettyobj(s) {
  return $(document.getElementById(prettify(s)));
}
function safeobj(s) {
  return $(document.getElementById(s));
}




function load_table_head(columns){
  var tbl_head = '<tr class="sticky darkth">';
  var tbl_foot = $('<tr class="darkth">');
  $.each(columns, function(i, column_tuple) {
    tbl_head += '<th class="sort a" data-sort="' + column_tuple[1] + '">';

    if(column_tuple[0] == 'SciLife Sample Name') {
      tbl_head += 'Sample';
    } else if(column_tuple[0] == 'Prep Finished Date') {
      tbl_head += 'Prep Finished';
    } else if(column_tuple[0] == 'Library Validation Caliper Image') {
      tbl_head += '<abbr data-toggle="tooltip" title="Latest Library Validation Caliper Image">Caliper Image</abbr>';
    } else if(column_tuple[0] == 'Million Reads Sequenced') {
      tbl_head += '<abbr data-toggle="tooltip" title="Reads passing application QC criteria. If paired end, this is read pairs.">Million Reads Sequenced</abbr>';
    } else if (column_tuple[0] == 'Workset'){
      tbl_head += 'Library Prep';
    } else {
      tbl_head += column_tuple[0];
    }

    tbl_head += '</th>';
    tbl_foot.append($('<th>')
      .text(function(){
        if(column_tuple[0].indexOf('SciLife Sample Name')===0){
          return 'Sample'
        }
        else if(column_tuple[0].indexOf('Prep Finished Date')===0){
          return 'Prep Finished'
        }
        else{
          return column_tuple[0]
        }
      })
    );
  });
  tbl_head += '</tr>';
  $("#samples_table_head").html(tbl_head);
  $("#samples_table_foot").html(tbl_foot);
}

function load_samples_table(colOrder) {
  if ($.fn.dataTable.isDataTable( '#sample_table' )){
    var dtbl= $('#sample_table').DataTable();
    dtbl.destroy();
    $("#sample_table_filter").remove();
}
  // Load the table header and get the filters
  var cols = read_current_filtering(true);
  if(!jQuery.isEmptyObject(colOrder)){
    var reorderCols = [];
    var colIndex = cols.map(function(row){return row[1];})
    $.each(colOrder, function(index, col){
      reorderCols.push(cols[colIndex.indexOf(col)]);
    });
    cols=reorderCols;
  }
  load_table_head(cols);

  // Display the loading spinner in the table
  $("#samples_table_body").html('<tr><td colspan="'+cols.length+'" class="text-muted"><span class="fa fa-sync fa-spin"></span> <em>Loading..</em></td></tr>');

  // Print each sample
  $.getJSON("/api/v1/project/" + project, function (samples_data) {
    var tbl_body = "";

    // No samples
    if(Object.getOwnPropertyNames(samples_data).length == 0){
      $('#tab_samples_content').html('<div class="alert alert-info">Project <strong>'+project+'</strong> does not yet have any samples..</div>');
      return false;
    }

    var last_sample='';
    var stripe = false;
    $.each(samples_data, function (sample, info) {
      //VERY hot fix for the PC's, to split the preps of the library validation tab
      if ($('#library_validation').hasClass('active')){
          //Add separate colors for samples
	        tbl_row = '<tr';
	        if(sample != last_sample){
		        if(!stripe){
			        tbl_row = tbl_row + ' class="table-secondary">';
			        stripe = true;
		        }
		        else{
			        stripe = false;
			        tbl_row = tbl_row + '>';
		        }
	        }
	        //If library prep is undefined, these fields are still relevant
	        if (info['library_prep'] === undefined){
              tbl_row = '<tr';
              if(!stripe){
                tbl_row = tbl_row + ' class="table-secondary">';
              }
              else{
                tbl_row = tbl_row +'>';
              }
		          $.each(cols, function(i, value){
			          var column_name = value[0];
			          var column_id = value[1];
			          if (column_id == 'start_date'){
				          tbl_row += auto_samples_cell(column_id, info['initial_qc'][column_id]);
			          }
			          else if (info[column_id] === undefined || info[column_id] === null || Object.keys(info[column_id]).length === 0){
				          tbl_row += '<td class="'+column_id+'">'+'-</td>';
			          }
                else {
                  if (column_id == "scilife_name") {
                    if(info[column_id] == 'Unexpectedbarcode'){
                      tbl_row += '<td class="'+column_id+'"><span class="badge bg-danger" data-toggle="tooltip" title="These reads failed to demultiplex">'+
                      info[column_id] + '</span></td>';
                    } else {
                      tbl_row += '<td class="'+column_id+'"><a class="text-decoration-none" target="_blank" data-toggle="tooltip" title="See this sample in the LIMS" '+
                      'href="' + lims_uri + '/clarity/search?scope=Sample&query='+info[column_id]+'">'+
                      info[column_id] + '</a></td>';
                    }
                  }
                  else if (column_id == 'status_(manual)'){
                    tbl_row += auto_samples_cell(column_id, info[column_id]);
                  }
                  else {
                    tbl_row += '<td class="'+column_id+'">'+info[column_id]+'</td>';
                  }
                }
              });
              tbl_row += '</tr>';
              tbl_body += tbl_row;
          }
          // If library prep is not undefined, in order to split the sample by prep, and add same color to preps of same sample
          $.each(info['library_prep'], function(prep, prepinfo){
              tbl_row = '<tr';
              if(!stripe){
                tbl_row = tbl_row + ' class="table-secondary">';
              }
              else{
                tbl_row = tbl_row +'>';
              }
              $.each(cols, function(i, value){
                var column_name = value[0];
                var column_id = value[1];
                if (value[2] == "basic-columns") {
                  info[column_id] = round_floats(info[column_id], 2);

                  // Scilife Sample Name
                  if (column_id == "scilife_name") {
                    if(info[column_id] == 'Unexpectedbarcode'){
                      tbl_row += '<td class="'+column_id+'"><span class="badge bg-danger" data-toggle="tooltip" title="These reads failed to demultiplex">'+
                              info[column_id] + '</span></td>';
                    } else {
                      // TODO - Wire this up to the new QC page when it's ready
                      tbl_row += '<td class="'+column_id+'"><a class="text-decoration-none" target="_blank" data-toggle="tooltip" title="See this sample in the LIMS" '+
                            'href="' + lims_uri + '/clarity/search?scope=Sample&query='+info[column_id]+'">'+
                            info[column_id] + '</a></td>';
                          }
                  }

                  // Library prep is an array of *Objects*
                  else if (column_id == 'library_prep') {
                    tbl_row += '<td class="' + column_id + '">';
                    tbl_row += auto_format(prep, true) + ' </td>';
                  }

                  // Split the preps
                  else if (column_id == 'prep_status'){
                    tbl_row += auto_samples_cell(column_id, prepinfo[column_id]);
                  }
                  else if (column_id == 'customer_name' && typeof info[column_id] !== 'undefined'){
                    tbl_row += '<td class="' + column_id + '">' +  info[column_id] + '</td>';
                  }
                  // everything else
                  else {
                    tbl_row += auto_samples_cell(column_id, info[column_id]);
                  }

                }
                else if (value[2] == "initial-qc-columns" && info['initial_qc'] !== undefined) {
                  info['initial_qc'][column_id] = round_floats(info['initial_qc'][column_id], 2);
                  tbl_row += auto_samples_cell(column_id, info['initial_qc'][column_id]);
                }

                else if (value[2] == "library-prep-columns") {
                        tbl_row += '<td class="' + column_id + '">';
                        prepinfo[column_id] = round_floats(prepinfo[column_id], 2);
                        if (!prepinfo[column_id]){
                          prepinfo[column_id] = '-';
                        }
                        // Special case for workset_name, which is a link to Genstat workset page
                        if (column_id == "workset_name" && prepinfo[column_id]) {
                          tbl_row += '<samp class="nowrap" title="Open Workset" data-toggle="tooltip"><a class="text-decoration-none" href="/workset/';
                          tbl_row += prepinfo[column_id] + '" target="_blank">' + prepinfo[column_id] + '</a></samp><br>';
                        }

                        // Special case for workset_setup, which is a link to the LIMS
                        else if (column_id == "workset_setup" && prepinfo[column_id]) {
                          tbl_row += '<samp class="nowrap" title="Open in LIMS" data-toggle="tooltip"><a class="text-decoration-none" href="' + lims_uri+ '/clarity/work-complete/';
                          tbl_row += prepinfo[column_id].split('-')[1] + '" target="_blank">' + prepinfo[column_id] + '</a></samp><br>';
                        }

                        // Make the reagent label use a samp tag
                        else if (column_id == "reagent_label" && prepinfo[column_id]) {
                          tbl_row += '<samp class="nowrap">' + prepinfo[column_id] + '</samp><br>';
                        }

                        else {
                          tbl_row += auto_format(prepinfo[column_id], true);
                        }
                        tbl_row += '</td>';
                      }

                else if (value[2] == "library-validation-columns" && info['library_prep'] !== undefined) {
                  tbl_row += '<td class="' + column_id + '">';
                  if ('library_validation' in prepinfo) {
                  // Populate the library_validation object when undefined
                    if (Object.keys(prepinfo['library_validation']).length === 0) {
                            prepinfo['library_validation']['-'] = { 'average_size_bp': "-", 'conc_units': "-", 'concentration': "-", 'finish_date': "-", 'initials': "-", 'size_(bp)': "-", 'start_date': "-", 'volume_(ul)': "-", 'well_location': "-"};
                            // Populate additional empty fields
                            if (!(info['prep_status'].length === 0 || info['prep_status'] == '-')){
                              info.prep_status = '-<br>' + auto_format(info['prep_status'][0].toString());
                            }
                    }
                    // We only want to show up the LIMS process ID with the higher number (the last one)
                    var process_id = max_str(Object.keys(prepinfo['library_validation']));
                    var validation_data = prepinfo['library_validation'][process_id];
                    if (validation_data) {
                      validation_data[column_id] = round_floats(validation_data[column_id], 2);
                      // Caliper column
                      if(column_id == 'caliper_image'){
                        tbl_row += '<span class="caliper_loading_spinner">'+
                                     '<span class="fa fa-sync fa-spin"></span>  Loading image..</span>'+
                                   '</span>'+
                                   '<a id="caliper_thumbnail_'+info['scilife_name']+'" class="caliper-thumbnail loading" href="'+validation_data[column_id]+'" data-imgtype="Library Validation Caliper Image" data-samplename="'+info['scilife_name']+'"></a>';
                      }
                      // Fragment Analyzer Image
                      else if (column_id == 'frag_an_image'){
                          tbl_row += '<span class="caliper_loading_spinner">'+
                                        '<span class="fa fa-sync fa-spin"></span>  Loading image..</span>'+
                                      '</span>'+
                                      '<a id="caliper_thumbnail_'+info['scilife_name']+'" class="caliper-thumbnail loading" href="'+validation_data[column_id]+'" data-imgtype="Library Validation Fragment Analyzer Image" data-samplename="'+info['scilife_name']+'"></a>';
                      }
                      // Remove the X from initial QC initials
                      else if(column_id == 'initials'){
                        if(validation_data[column_id] !== '-'){
                                var sig = validation_data[column_id];
                                if(sig.length == 3 && sig[2] == 'X'){
                                  sig = sig.substring(0,2);
                                }
                                tbl_row += '<span class="badge bg-secondary" data-toggle="tooltip" title="Original signature: '+validation_data[column_id]+'">'+sig+'</span><br>';
                        }
                        else{
                          tbl_row += '-<br>';
                        }
                      }

                      // Everything else
                      else {
                        tbl_row += auto_format(validation_data[column_id], true);
                      }
                    }
                  }
                  tbl_row += '</td>';
                }
              });
              tbl_row += '</tr>';
              tbl_body += tbl_row;
              last_sample = sample;
          });
      }
      else{
        tbl_row = '<tr>';
        $.each(cols, function(i, value){
          var column_name = value[0];
          var column_id = value[1];
          if (value[2] == "basic-columns") {
            info[column_id] = round_floats(info[column_id], 2);

            // Scilife Sample Name
            if (column_id == "scilife_name") {
              if(info[column_id] == 'Unexpectedbarcode'){
                tbl_row += '<td class="'+column_id+'"><span class="badge bg-danger" data-toggle="tooltip" title="These reads failed to demultiplex">'+
                            info[column_id] + '</span></td>';
              } else {
                // TODO - Wire this up to the new QC page when it's ready
                tbl_row += '<td class="'+column_id+'"><a class="text-decoration-none" target="_blank" data-toggle="tooltip" title="See this sample in the LIMS" '+
                            'href="' + lims_uri + '/clarity/search?scope=Sample&query='+info[column_id]+'">'+
                            info[column_id] + '</a></td>';
              }
            }

            // Sample run metrics is an array of links - link to flowcells page
            else if (column_id == 'sample_run_metrics') {
              tbl_row += '<td class="' + column_id + '">';
              for (var i=0; i<info[column_id].length; i++) {
                var fc = info[column_id][i];
                // Remove the lane number and barcode - eg 6_FCID_GTGAAA
                if(make_project_links(' '+fc).includes('href="/flowcells_ont/')){
                  tbl_row +=  '<samp class="nowrap">'+make_project_links(' '+fc)+ '</samp><br>';
                }
                else{
                  fc = fc.substring(2);
                  fc = fc.replace(/_[ACTG\-]+$/,'');
                  fc = fc.replace('_NoIndex', '');
                  tbl_row += '<samp class="nowrap"><a class="text-decoration-none" href="/flowcells/' + fc + '">' +
                  info[column_id][i] + '</a></samp><br>';
                }
              }
              tbl_row += '</td>';
            }

            // Library prep is an array of *Objects*
            else if (column_id == 'library_prep') {
              tbl_row += '<td class="' + column_id + '">';
              if (info[column_id] !== undefined) {
                var libs = Object.keys(info[column_id]).sort();
                $.each(libs, function(idx, prep){
                  tbl_row += auto_format(prep, true) + ' ';
                });
              }
              tbl_row += '</td>';
            }

            // Make sure that 'million reads' has two decimal places
            else if (column_id == 'total_reads_(m)' && typeof info[column_id] !== 'undefined'){
              tbl_row += '<td class="' + column_id + ' text-right">' + Number(info[column_id]).toFixed(2) + '</td>';
            }

            else if (column_id == 'customer_name' && typeof info[column_id] !== 'undefined'){
              tbl_row += '<td class="' + column_id + '">' +  info[column_id] + '</td>';
            }
            // everything else
            else {
              tbl_row += auto_samples_cell(column_id, info[column_id]);
            }

          }
          else if (value[2] == "initial-qc-columns" && info['initial_qc'] !== undefined) {
            info['initial_qc'][column_id] = round_floats(info['initial_qc'][column_id], 2);

            // Fragment Analyzer Image
            if (column_id == 'frag_an_image'){
                tbl_row += '<td class="' + column_id + '">'+
                            '<span class="caliper_loading_spinner">'+
                              '<span class="fa fa-sync fa-spin"></span>  Loading image..</span>'+
                            '</span>'+
                            '<a id="caliper_thumbnail_'+info['scilife_name']+'" class="caliper-thumbnail loading" href="'+info['initial_qc'][column_id]+'" data-imgtype="Initial QC Fragment Analyzer Image" data-samplename="'+info['scilife_name']+'"></a>'+
                          '</td>';
            }

            // Caliper image
            else if (column_id == 'caliper_image'){
                tbl_row += '<td class="' + column_id + '">'+
                            '<span class="caliper_loading_spinner">'+
                              '<span class="fa fa-sync fa-spin"></span>  Loading image..</span>'+
                            '</span>'+
                            '<a id="caliper_thumbnail_'+info['scilife_name']+'" class="caliper-thumbnail loading" href="'+info['initial_qc'][column_id]+'" data-imgtype="Initial QC Caliper Image" data-samplename="'+info['scilife_name']+'"></a>'+
                          '</td>';
            }

            // Remove the X from initial QC initials
            else if(column_id == 'initials'){
              var sig = info['initial_qc'][column_id];
              if(sig && sig.length == 3 && sig[2] == 'X'){
                sig = sig.substring(0,2);
              }
              tbl_row += '<td class="'+column_id+'">'+
                          '<span class="badge bg-secondary" data-toggle="tooltip" title="Original signature: '+info['initial_qc'][column_id]+'">'+
                              sig+'</span></td>';
            }

            else if(column_id == 'initial_qc_status'){
              tbl_row += '<td class="' + column_id +' align-middle'+ '">' + auto_format(info['initial_qc'][column_id], true) + ' </td>';
            }

            // everything else
            else {
              tbl_row += auto_samples_cell(column_id, info['initial_qc'][column_id]);
            }
          }

          else if (value[2] == "library-prep-columns" && info['library_prep'] !== undefined) {

            tbl_row += '<td class="' + column_id + '">';
            var libs = Object.keys(info['library_prep']).sort();
            $.each(libs, function(idx, library){
              info_library=info['library_prep'][library];
              info_library[column_id] = round_floats(info_library[column_id], 2);

              // Special case for workset_name, which is a link to Genstat workset page
              if (column_id == "workset_name" && info_library[column_id]) {
                tbl_row += '<samp class="nowrap" title="Open Workset" data-toggle="tooltip"><a class="text-decoration-none" href="/workset/';
                tbl_row += info_library[column_id] + '" target="_blank">' + info_library[column_id] + '</a></samp><br>';
              }

              // Special case for workset_setup, which is a link to the LIMS
              else if (column_id == "workset_setup" && info_library[column_id]) {
                tbl_row += '<samp class="nowrap" title="Open in LIMS" data-toggle="tooltip"><a class="text-decoration-none" href="' + lims_uri+ '/clarity/work-complete/';
                tbl_row += info_library[column_id].split('-')[1] + '" target="_blank">' + info_library[column_id] + '</a></samp><br>';
              }

              // Make the reagent label use a samp tag
              else if (column_id == "reagent_label" && info_library[column_id]) {
                tbl_row += '<samp class="nowrap">' + info_library[column_id] + '</samp><br>';
              }

              else {
                tbl_row += auto_format(info_library[column_id], true);
              }
            });
            tbl_row += '</td>';
          }

          else if (value[2] == "library-validation-columns" && info['library_prep'] !== undefined) {
            tbl_row += '<td class="' + column_id + '">';
            var libs = Object.keys(info['library_prep']).sort();
            $.each(libs, function(idx, library){
              info_library=info['library_prep'][library];
              if ('library_validation' in info_library) {
                // Populate the library_validation object when undefined
                if (Object.keys(info_library['library_validation']).length === 0) {
                  info_library['library_validation']['-'] = { 'average_size_bp': "-", 'conc_units': "-", 'concentration': "-", 'finish_date': "-", 'initials': "-", 'size_(bp)': "-", 'start_date': "-", 'volume_(ul)': "-", 'well_location': "-"};
                  // Populate additional empty fields
                  if (!(info['prep_status'].length === 0 || info['prep_status'] == '-')){
                    info.prep_status = '-<br>' + auto_format(info['prep_status'][0].toString());
                  }
                }
                // We only want to show up the LIMS process ID with the higher number (the last one)
                var process_id = max_str(Object.keys(info_library['library_validation']));
                var validation_data = info_library['library_validation'][process_id];
                if (validation_data) {
                  validation_data[column_id] = round_floats(validation_data[column_id], 2);
                  // Caliper column
                  if(column_id == 'caliper_image'){
                       tbl_row += '<span class="caliper_loading_spinner">'+
                                     '<span class="fa fa-sync fa-spin"></span>  Loading image..</span>'+
                                   '</span>'+
                                   '<a id="caliper_thumbnail_'+info['scilife_name']+'" class="caliper-thumbnail loading" href="'+validation_data[column_id]+'" data-imgtype="Library Validation Caliper Image" data-samplename="'+info['scilife_name']+'"></a>';
                  }
                  // Fragment Analyzer Image
                  else if (column_id == 'frag_an_image'){
                      tbl_row += '<span class="caliper_loading_spinner">'+
                                    '<span class="fa fa-sync fa-spin"></span>  Loading image..</span>'+
                                  '</span>'+
                                  '<a id="caliper_thumbnail_'+info['scilife_name']+'" class="caliper-thumbnail loading" href="'+validation_data[column_id]+'" data-imgtype="Library Validation Fragment Analyzer Image" data-samplename="'+info['scilife_name']+'"></a>';
                  }

                  // Remove the X from initial QC initials
                  else if(column_id == 'initials'){
                    if(validation_data[column_id] !== '-'){
                      var sig = validation_data[column_id];
                      if(sig.length == 3 && sig[2] == 'X'){
                        sig = sig.substring(0,2);
                      }
                      tbl_row += '<span class="badge bg-secondary" data-toggle="tooltip" title="Original signature: '+validation_data[column_id]+'">'+sig+'</span><br>';
                    }
                    else{
                      tbl_row += '-<br>';
                    }
                  }

                  // Everything else
                  else {
                    tbl_row += auto_format(validation_data[column_id], true);
                  }
                }
              }
            });
            tbl_row += '</td>';
          }
          else if (value[2] == "pre-prep-library-validation-columns" && info['library_prep'] !== undefined) {
            tbl_row += '<td class="' + column_id + '">';
            var libs = Object.keys(info['library_prep']).sort();
            $.each(libs, function(idx, library){
              info_library=info['library_prep'][library];
              if ('pre_prep_library_validation' in info_library) {
                // We only want to show up the LIMS process ID with the higher number (the last one)
                var process_id = max_str(Object.keys(info_library['pre_prep_library_validation']));
                var validation_data = info_library['pre_prep_library_validation'][process_id];
                if (validation_data) {
                  validation_data[column_id] = round_floats(validation_data[column_id], 2);
                  tbl_row += auto_format(validation_data[column_id]);
                }
              }
            });
            tbl_row += '</td>';
          }

          // Details columns
          else {
            info['details'][column_id] = round_floats(info['details'][column_id], 2);
            tbl_row += auto_samples_cell(column_id, info['details'][column_id]);
          }
        });
        tbl_row += '</tr>';
        tbl_body += tbl_row;
      }
    });
    $("#samples_table_body").html(tbl_body);

    // Initialise the table sorting
    init_datatable();

    // last step, update caliper images
    update_caliper();
  }).fail(function( jqxhr, textStatus, error ) {
      var err = textStatus + ", " + error;
      console.log( "Couldn't load project samples: " + err );
  });
}
function update_caliper(){
  $.each($('.caliper-thumbnail'), function(){
    if($(this).hasClass('loading')){
        var imglink = $(this).attr('href');
        var el = $(this);
        if(imglink==="undefined"){
                el.append('<span class="badge bg-undefined">No caliper link</span>');
                el.prev('.caliper_loading_spinner').remove();
                el.removeClass('loading');
        } else {
            $.getJSON(imglink, function(data){
                el.append('<img src="data:image/png;base64,'+data+'">');
                el.prev('.caliper_loading_spinner').remove();
                el.removeClass('loading');
            }).fail(function( jqxhr, textStatus, error) {
                el.append('<span class="badge bg-danger"><abbr title="'+imglink+' '+textStatus+'">Error</abbr></span>');
                el.prev('.caliper_loading_spinner').remove();
                el.removeClass('loading');
            });
       }
   }
 });
}
function loadCaliperImageModal(target){
  var data = $(target).find('img').attr('src');
  var samplename = $(target).data('samplename');
  var imgtype = $(target).data('imgtype');
  var nextTarget = $(target).closest('tr').next().find('.caliper-thumbnail').attr('id');
  var prevTarget = $(target).closest('tr').prev().find('.caliper-thumbnail').attr('id');
  if(nextTarget === undefined){
    nextTarget = $('#samples_table_body').find('.caliper-thumbnail:first').attr('id');
  }
  if(prevTarget === undefined){
    prevTarget = $('#samples_table_body').find('.caliper-thumbnail:last').attr('id');
  }

  $('#caliperModal .modal-header h3').html(samplename+' <small>'+imgtype+'</small>');
  if(data === undefined){
    $('#caliper_modal_image_wrapper').html('<p class="help-block text-center">Data still loading. Please try again in a moment..</p>');
  } else {
    $('#caliper_modal_image_wrapper').html('<img src="'+data+'" title="'+name+'" />');
  }
  $('#caliperModal .right').attr('href', '#'+nextTarget);
  $('#caliperModal .left').attr('href', '#'+prevTarget);
  $('#caliperModal').modal();
}

// Bunch of functions here moved into base.js



// Get rid of the "read-more" if we're just not that big
function check_fade_height(){
  if($('#customer_project_description_wrapper').outerHeight() < 100){
    $('.fade-read-more').remove();
    $('#customer_project_description_wrapper').removeClass('showfade');
  }
}

// Fade the "read-more" customer comment
// Stolen from http://css-tricks.com/text-fade-read-more/
$('#customer_project_description_wrapper').hover(function(e){
  e.stopPropagation();
  $('.fade-read-more .btn').fadeIn();
}, function(e){
  e.stopPropagation();
  $('.fade-read-more .btn').fadeOut();
});

$('#customer_project_description_wrapper, #customer_project_description_wrapper .btn').click(function() {
	$('#customer_project_description_wrapper')
		.css({"height": $('#customer_project_description_wrapper').height(),
			"max-height": 9999})
		.animate({
			"height": $('#customer_project_description').height()
		});
	$('.fade-read-more').fadeOut();
	return false;
});



// Awesome dates timeline
$('#show_order_timeline').click(function(e){
  e.preventDefault();
  id = $('#show_order_timeline').children('span:visible').prop('id');
  if( id == 'hide_orderdates_btn' ){
    $('#project_timescale_orderdates').prop('style', 'visibility:hidden;');
    $('#project_timescale_orderdates').empty();
    make_timescale('production');
    $('#project_timescale_production').css('visibility', 'visible');
    $('#hide_orderdates_btn, #show_orderdates_btn').toggle();
  }
  else{
    $('#project_timescale_production').prop('style', 'visibility:hidden;');
    $('#project_timescale_production').empty();
    make_timescale('order');
    $('#project_timescale_orderdates').css('visibility', 'visible');
    $('#hide_orderdates_btn, #show_orderdates_btn').toggle();
  }
});
function make_timescale(check){
  if( check == 'order' ){
    make_timescale_bar('#project_timescale_orderdates', true);
  }
  else{
    make_timescale_bar('#project_timescale_production', false);
  }
}
// Fire tooltips on datestamp hover
$('.rawdate').hover(
  function(){
    $(".project_timescale").find("[data-datestamp='" + $(this).text() + "']").tooltip({html: true}).tooltip('show');
  }, function() {
    $(".project_timescale").find("[data-datestamp='" + $(this).text() + "']").tooltip('hide');
  }
);

function make_timescale_bar(tsid, include_orderdates){
	// Which elements are we looking at?
  var order_date_ids = [
      	'order_received',
      	'contract_sent',
      	'plates_sent',
      	'contract_received',
      	'sample_information_received',
      	'samples_received',
      	'open_date',
      	'first_initial_qc_start_date'
      ];
  var production_date_ids = [
  			'queued',
  			'library_prep_start',
  			'qc_library_finished',
  			'sequencing_start_date',
  			'all_samples_sequenced',
  			'all_raw_data_delivered',
  			'best_practice_analysis_completed',
  			'close_date',
  			'aborted'
  		];
  if(include_orderdates){
    date_ids = order_date_ids.concat(production_date_ids);
  } else {
    date_ids = production_date_ids;
  }

	var oldest = new Date();
  var opendate = new Date();
  var prodstart = new Date();
	var newest = new Date();
	var dates = {};
	$.each(date_ids, function(i, id){
		if($('#'+id).text() !== '-'){
      // Get date and nice description
      var el = $('#'+id);
      var rawdate = el.text();
			var dateobj = new Date(rawdate);
      var name = id;
			if(el.is('dd')){
				name = el.prev().text();
			} else if(el.is('span')){
				name = el.parent().prev().text();
			}
      // Push to hash
			if(typeof dates[rawdate] == 'undefined') {
				dates[rawdate] = [name];
			} else {
			  dates[rawdate].push(name);
			}
			if(dateobj.getTime() < oldest.getTime()){
				oldest = dateobj;
			}
      // Open date
			if(id == 'open_date'){
				opendate = dateobj;
			}
      // Production start date
			if(id == 'queued'){
				prodstart = dateobj;
			}
      // Close dates
			if(id == 'close_date' || id == 'aborted'){
				newest = dateobj;
			}
		}
	});

  // Which colours and timestops are we using?
  var cols = ['#82BFFF', '#5785FF', '#FFC521', '#FA4C47'];
  var colstops = [
        prodstart.getTime(),                        // prod start  - l blue
        prodstart.getTime() + (3*7*24*60*60*1000),  // 3 weeks - dark blue
        prodstart.getTime() + (6*7*24*60*60*1000),  // 6 weeks - orange
        prodstart.getTime() + (9*7*24*60*60*1000),  // 9 weeks - red
        newest.getTime()                            // End of bar
      ];
  if(include_orderdates){
    cols = ['#DEDEDE','#A8D0A2'].concat(cols);
    colstops = [oldest.getTime(), opendate.getTime()].concat(colstops);
  }
	if(oldest.getTime() < newest.getTime()){
		// Set up the CSS on the bar
		var range = newest.getTime() - oldest.getTime();
    var gradcols = [];
    var lastpercent = 0;
    $.each(colstops, function(j, thetime){
      if(thetime == oldest.getTime()){ return true; }
      var percent = ((thetime - oldest.getTime()) / range) * 100;
      gradcols.push(cols[j-1]+' '+lastpercent+'%, '+cols[j-1]+' '+percent+'%');
      lastpercent = percent;
    });

    // Make the bar coloured
		$(tsid).css('height', '2px');
		$(tsid).css("background-image", "-webkit-linear-gradient(left, "+gradcols.join(',')+")");
		$(tsid).css("background-image", "-moz-linear-gradient(right, "+gradcols.join(',')+")");
		$(tsid).css("background-image", "-o-linear-gradient(right, "+gradcols.join(',')+")");
		$(tsid).css("background-image", "linear-gradient(to right, "+gradcols.join(',')+")");

		// Put date objects onto the timeline
		$.each(dates, function(rawdate, names){
			var dateobj = new Date(rawdate);

      // Find the colour for this date
      var thiscol = cols[0];
      $.each(colstops, function(j, thetime){
        if(dateobj.getTime() > thetime){
          if(j == cols.length){
            thiscol = cols[j-1];
          } else {
            thiscol = cols[j];
          }
        }
      });

      // Write the hover text
      var timeDiff = dateobj.getTime() - prodstart.getTime();
      var diffDays = Math.ceil(timeDiff / (1000 * 3600 * 24));
      var diffWeeks = 0;
      while(diffDays >= 7){ diffWeeks += 1; diffDays -= 7; }
      var diffdaystext = '';
      if(diffDays > 0 || diffWeeks > 0){
         diffdaystext = '<br><em>';
         if(diffWeeks > 0){ diffdaystext += diffWeeks + 'w '; }
         if(diffDays > 0){ diffdaystext += diffDays + 'd'; }
         diffdaystext += ' since queue date</em>';
      }

      // Work out where to place the tick and plot it
			var percent = ((dateobj.getTime() - oldest.getTime()) / range) * 100;
			$(tsid).append('<div class="timelineTarget" style="left:'+percent+'%;" data-datestamp="'+rawdate+'" data-toggle="tooltip" data-placement="bottom"  data-html="true" title="'+rawdate+'<br /><strong>'+names.join('</strong><br /><strong>')+'</strong>'+diffdaystext+'"><div class="timelineTick" style="background-color:'+thiscol+';"></div></div>');

      // Coloured borders next to dates in table
      $(':contains('+rawdate+')').filter(function(){if ($(this).children().length === 0){if($(this).next('.borderbar').length>0){$(this).next('.borderbar').remove()}
        return $(this).children().length === 0;}}).after('<span class="borderbar" style="border-right: 2px solid '+thiscol+';"></span>');
		});
	}
  $('.timelineTarget[data-toggle="tooltip"]').tooltip();
}

// Warn users about old projects
function old_project_warning(warndate_raw){
  var openDate = new Date($('#open_date').text());
  var warnDate = new Date(warndate_raw);
  if(openDate.getTime() < warnDate.getTime()){
    $('#old_project_warning').show();
    $('#old_project_warning').attr('title', 'This project was created before '+warndate_raw+'.<br>Genomics Status may be inaccurate.');
  }
}
function load_charon_summary(){
  $.getJSON("/api/v1/charon_summary/"+ project, function(data) {
      if (data['tot'] != 0){
          $('#charon-status').show();
          $('#charon-status-tot').text(data['tot']);
          $('#charon-status-ab').text(data['ab']);
          $('#charon-status-seq').text(data['seq']);
          $('#charon-status-ana').text(data['ana']);
          $('#charon-status-passed').text(data['passed_unab']);
          $('#charon-status-failed').text(data['failed']);
          $('#charon-status-runn').text(data['runn']);
          $('#charon-status-hge').text(data['hge']);
          var del_projs = '';
          data['gdp'].forEach(function(del_proj){
              del_projs += '<span class="badge bg-secondary mr-1">'+del_proj+'</span>';
          });
          $('#charon-status-gdp').html(del_projs);
      }
  }).fail(function( jqxhr, textStatus, error ) {
      var err = textStatus + ", " + error;
      console.log( "Couldn't load charon data: " + err );
  });
}

$('#downloadImgsBtn').click(function(e){
  var option=$('input[name="imgRadio"]:checked').val();
  if(option==undefined){
    alert('Please choose an option!');
    return;
  }
  var download_api_url = '/api/v1/download_images/'+project+'/'+option;
  $('#chooseImgType').attr('action', download_api_url).attr('method', 'post');
});
