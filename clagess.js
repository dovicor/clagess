
// Copyright (c) 2023-2024 Don Organ
//
// CLAGESS: CLaiming AGe Estimator for Social Security
// A javascript tool that takes user input via an HTML form, and generates tables and/or graphs
// based on formulas used by the Social Security Administration to determine retirement benefits
// based on claiming age.
// Claiming age is the enrollee's age when receiving the first monthly benefit payment. Generally
// enrollees can claim first benefits any month between their 62nd and 70th birthdays. Benefit
// payments increase slightly for each month the enrollee defers claiming first benefit.
//
// An enrollee's benefits are affected by his or her work history - the SSA performs calculations
// based on the highest 35 years of averaged indexed monthly earnings. This becomes an input
// (called PIA - primary insurance amount) to this software.
// An enrollee's full retirement age is 66 years for people born 1954 or earlier, 67 for people
// borth 1960 or later and somewhere inbetween (increasing two months per calendar year) for
// those born 1955 through 1959.
//
// This software requires Chart.js - which is available under the MIT license (see notice elsewhere
// in this source code) - generally the HTML file which sources this script should source the
// Chart.js script earlier.
//
//
const start_time = Date.now();

let put_negative_values_in_parenthesis = 0;

function isNumber(value) { // from https://www.shecodes.io/athena/92427-how-to-check-if-a-value-is-a-number-in-javascript
	return typeof value === 'number';
}

// I'd like the following 3 variables to behave to C++'s static variables in a function.
let clagess_color_interpolate_initialized = 0;
let young_rgb_list = [];
let old_rgb_list = [];
function clagess_color_interpolate( value ) // TODO - I need to generalize this for any two colors.
{
	if ( ! clagess_color_interpolate_initialized ) {
		const young_style = getComputedStyle( document.querySelector(".zz_young") );
		const old_style = getComputedStyle( document.querySelector(".zz_old") );
		let young_rgb_list_string = young_style.color.match(/\d+/g);
		let old_rgb_list_string = old_style.color.match(/\d+/g);
		young_rgb_list = young_rgb_list_string.map(Number);
		old_rgb_list = old_rgb_list_string.map(Number);

		clagess_color_interpolate_initialized = 1;
	}
	return "rgb(" + Math.round(String( young_rgb_list[0] + value * (old_rgb_list[0] - young_rgb_list[0]) )) + "," +
		        Math.round(String( young_rgb_list[1] + value * (old_rgb_list[1] - young_rgb_list[1]) )) + "," +
		        Math.round(String( young_rgb_list[2] + value * (old_rgb_list[2] - young_rgb_list[2]) )) + ")";
}


const months_user = [ "Illegal value (0) - should be 1..12",
		"January", "February", "March", "April", "May", "June",
		"July", "August", "September", "October", "November", "December" ];

let clagess_monthly_benefit = new Array(96+1); // 12 months X 8 years. Index by month of retirement start with index=0 at 62 years, 0 months - thru 70 years and 0 months. Dependent on birth-year.
let clagess_birth_year = 0; // 0 is undefined. Should re-initialize clagess_monthly_benefit (above) when the birth-year changes.

function clagess_set_birth_year( new_birth_year )
{
	if (new_birth_year == clagess_birth_year) { return; } // already set, so nothing to do
	clagess_birth_year = new_birth_year;
	clagess_monthly_benefit = new Array(96+1);
	for (let index = 0; index < clagess_monthly_benefit.length; index++ ) {
		let age_year  = 62 + Math.trunc(index / 12);
		let age_month = index % 12;
		let retirement_age = age_year + age_month / 12;
		let calced_benefit = clagess_calc_monthly_benefit( clagess_birth_year,  retirement_age, 1 );
		let my_object =  { age_year: 62 + Math.trunc(index / 12), age_month: index %12, benefit : calced_benefit };
		clagess_monthly_benefit[index] = my_object;
	}	
}



const clagess_chart1_transition = { // Social Security's Full Retirement Age - transitions from 66 years old to 67 for people born in the mid-late 1950s.
	1954: (66+ 0/12),
	1955: (66+ 2/12),
	1956: (66+ 4/12),
	1957: (66+ 6/12),
	1958: (66+ 8/12),
	1959: (66+10/12),
	1960: (67+ 0/12)
};
function clagess_full_retirement_age(birth_year)
{
	if (birth_year <= 1954) { birth_year = 1954; }
	else if (birth_year >= 1960) { birth_year = 1960; }
	return clagess_chart1_transition[birth_year];
}

function string_ycm_to_num(ycm_string)
// Input a string. "72" should return the numeric value of 72. "72.5" should return the numeric value of 72.5.
// If string contains a ':' - consider that as a separator between a year and a 0-based month number. So
// "72:6" should return 72.5 (i.e. 6th month of year 72).
{
	let values = ycm_string.split(":");
	return Number(values[0]) + ( (values.length > 1) ? (Number(values[1])/12) : 0 );
}


function clagess_to_years_months(age, format=0)
{
	let years = Math.floor( age );
	let fractional = age - years;
	let months = Math.round(fractional * 12);
	if (format == 0) {
		if (months==0) { return `${years} y`; }
		return `${years} y,  ${months} m`;
	}
	if (format == 1) { return `${years} years, ${months} months`; }
	if (format == 2) { return `${years}:${months}`; }
	if (format == 3) {
		if (months==0) { return `${years}`; }
		return `${years}:${months}`;
	}
	if (format == 4) {
		if (months==0) { return `${years} years`; }
		return `${years} years  ${months} months`;
	}
	else { console.error("Internal error: unknown format in clagess_to_years_months(age="+String(age)+", format=" + String(months) + ")"); }
}

function approximatelyEqual( value1, value2, epsilon) { // copied from: https://www.30secondsofcode.org/js/s/approximately-equal/
	return Math.abs( value1 - value2 ) < epsilon;
}

function clagess_calc_monthly_benefit( birth_year, retirement_age, pia=1000, init=0)
{
	let full_retirement_age = clagess_full_retirement_age( birth_year );
	if ( approximatelyEqual( retirement_age, full_retirement_age ) ) { return pia; }

	if (retirement_age < full_retirement_age ) {
		let years_early = full_retirement_age - retirement_age;
		let devalue = 0;
		if (years_early <= 3) {
			devalue = 1 - years_early * 12*5/900
		} else { // > 3 years early
			//devalue = 1 - (years_early * 12*5/900) - ((years_early - 3) * 12 * 5/1200);
			devalue = 1 - (3 * 12*5/900) - ((years_early - 3) * 12 * 5/1200);
		}
		return pia * devalue;
	}
	// Else - delayed retirement - after full retirement age
	if (retirement_age > 70) { retirement_age = 70; } // No benefit for delaying after 70 years old
	let years_late = retirement_age - full_retirement_age;
	let credit_per_year = 0.08; // For anyone born 1943 or later - there's a table we could do a lookup on for earlier - but I think that's moot now.
	return pia * (1 + years_late * credit_per_year);
}

function clagess_get_monthly_benefit(birth_year, retirement_age, pia)
{
	clagess_set_birth_year( birth_year );
	let index = Math.round( (retirement_age - 62) * 12 );
	if (index < 0) { index = 0; }
	if (index > clagess_monthly_benefit.length) { index = clagess_monthly_benefit.length - 1; }
	return clagess_monthly_benefit[index].benefit * pia;
}


function clagess_calc_net_present_value( birth_year, age_at_retirement, age_at_death, interest_rate, pia=1000 )
{
	if (0) { console.log("clagess_calc_net_present_value(birth_year=", birth_year, ", age_at_retirement=", age_at_retirement, ", age_at_death=", age_at_death, ", interest_rate=", interest_rate, ", pia=", pia, ")" ); }
	let monthly_benefit = clagess_get_monthly_benefit( birth_year, age_at_retirement, pia );

	let npv_age = 62; // Can I make this a parameter??? Will need to refactor the code below.

	months_62_until_retirement = (age_at_retirement - 62) * 12;
	if (months_62_until_retirement < 0) { months_62_until_retirement = 0; }

	months_62_until_death = (age_at_death - 62) * 12;
	if (months_62_until_death < 0) { months_62_until_death = 0; }

	let npv = 0;
	for (let months_after_62 = 0; months_after_62 < months_62_until_death; months_after_62++) {
		if (months_after_62 >= months_62_until_retirement) {
			let this_npv = monthly_benefit / Math.pow( (interest_rate/12) / 100 + 1, months_after_62+1 ); // Can this be more efficient? Since monthly_benefit doesn't vary.
			npv += this_npv;
		}
	}
	return npv;
}

function clagess_calc_future_value( birth_year, age_at_retirement, age_at_death, interest_rate, cola, birth_month=0, pia=1000 )
{
	if (0) { console.log("clagess_calc_future_value(birth_year=", birth_year, ", age_at_retirement=", age_at_retirement, ", age_at_death=", age_at_death, ", interest_rate=", interest_rate, ", cola=", cola, " birth_month=", birth_month, ", pia=", pia, ")" ); }
	let monthly_benefit = clagess_get_monthly_benefit( birth_year, age_at_retirement, pia );

	months_62_until_retirement = (age_at_retirement - 62) * 12;
	if (months_62_until_retirement < 0) { months_62_until_retirement = 0; }

	months_62_until_death = (age_at_death - 62) * 12;
	if (months_62_until_death < 0) { months_62_until_death = 0; }

	let multiplicative_factor = (interest_rate/12) / 100 + 1;

	let balance = 0;
	for (let months_after_62 = 0; months_after_62 < months_62_until_death; months_after_62++) {
		if ((months_after_62 > 0) && (months_after_62 % 12) == (11-birth_month)) { monthly_benefit = monthly_benefit * (1 + cola/100); }
		if (months_after_62 >= months_62_until_retirement) {
			balance = balance * multiplicative_factor;
			balance += monthly_benefit
		}
	}
	return balance;
}

function clagess_best_month_npv_62( birth_year, age_at_death, interest_rate, pia=1000)
// Find the best Claiming-Age - i.e. the best month to start collecting SS benefits, based on optimizing net-preset-value calculations for age 62.
// Loop through all the possible ages at retirement (i.e. age 62 thru 70) and identify the one with the best present-value at age 62.
{
	if(0) { console.log("Enter clagess_best_month_npv_62(birth_year=", birth_year, ", age_at_death=", age_at_death, ", interest_rate=", interest_rate ); }
	
	let best_npv = 0;
	let best_month = 0;

	for (let months_after_62 = 0; months_after_62 < (96+1); months_after_62++) {
		let this_npv = clagess_calc_net_present_value( birth_year, 62 + (months_after_62/12), age_at_death, interest_rate );
		if (this_npv > best_npv) {
			best_npv = this_npv;
			best_month = months_after_62;
		}
	}

	return { best_npv: best_npv, best_month: best_month };
}


function clagess_best_month_bank_balance( birth_year, age_at_death, interest_rate, cola=0, birth_month_user=1, pia=1000)
// Find the best month to start collecting SS benefits, based on optimizing net-preset-value calculations for age 62.
{
	if(0) { console.log("Enter clagess_best_month_bank_balance(birth_year=", birth_year, ", age_at_death=", age_at_death, ", interest_rate=", interest_rate, ", cola=", cola, ", birth_month_user=", birth_month_user, ", pia=", pia, ")" ); }
	
	let best_FV = 0;
	let best_month = 0;

	for (let months_after_62 = 0; months_after_62 < (96+1); months_after_62++) {
		let this_FV = clagess_calc_future_value( birth_year, 62 + (months_after_62/12), age_at_death, interest_rate, cola, birth_month_user-1, pia );
		if (this_FV > best_FV) {
			best_FV = this_FV;
			best_month = months_after_62;
		}
	}

	return { best_month : best_month, best_FV : best_FV };
}


function clagess_generate_table_best_bank_balance( table_element, canvas_element, birth_year, birth_month_user=1, cola=0, pia=1000, age_at_death=100)
{
	let birth_month_adj = birth_month_user-1; // Users months are 1..12. Internally we use 0..11.
	if(0) { console.log("XXXXXX   Enter clagess_generate_table_best_bank_balance(table_element=", table_element, ", canvas_element=", canvas_element, ", birth_year=", birth_year, " birth_month: (user=", birth_month_user, ",adjusted=", birth_month_adj, ", cola=", cola, ", pia=", pia, ", age_at_death=", age_at_death ); }

	let col_hdrs = [];
	let row_hdrs = [];
	let data_2d = [];
	// mo = mouseover
	let data_2d_mo = [];
	let data_2d_bgc = []; // background color

	let first_row = true;
	for (aad = 62; aad <=age_at_death; aad += 2) { // foreach row: age-at-death
		row_hdrs.push( aad );
		let this_row = [];
		let this_row_mo = [];
		let this_row_bgc = []
		for (let irate = -4; irate <= 8; irate++) { // for each column
			if (first_row) { col_hdrs.push( parseFloat(irate).toFixed(1) + "%" ); }
			let the_best = clagess_best_month_bank_balance( birth_year, aad, irate, cola, birth_month_adj, pia);
			this_row.push( clagess_to_years_months( 62 + the_best.best_month/12, 2 ) );
			this_row_mo.push( "Best Bank Balance is $"+ parseFloat( the_best.best_FV ).toFixed(2) +
					" for birthday="+ aad + " and interest rate="+ irate+
				"% is with Claiming-Age at "+ clagess_to_years_months( 62 + the_best.best_month/12, 2 ) + "." );
			this_row_bgc.push( clagess_color_interpolate ( the_best.best_month / 96 ) );
		} // for aad
		data_2d.push( this_row );
		data_2d_mo.push( this_row_mo );
		data_2d_bgc.push( this_row_bgc );
		first_row = false;
	} // for irate

	let new_table = clagess_generate_html_table(table_element, data_2d, col_hdrs, row_hdrs, data_2d_mo, null, null, data_2d_bgc );
	table_caption = new_table.createCaption();
	table_caption.innerHTML = "Best claiming age (year:month) for a given situation of interest rates (columns), longevity (rows), " +
				"COLA ("+ parseFloat(cola).toFixed(1)+ "%) for birth month of "+ months_user[birth_month_user] +
				" " + birth_year+ ". (Based on analyzing bank account balance at indicated birthdays). PIA=$"+pia+"." +
				"<br>Note: Assumes benefits are paid when due (typically they are paid the next month).";

	clagess_create_table_borders( new_table, ["62:0", "70:0"]);
	return new_table;
}



function clagess_generate_html_table(table_element, data_2d, col_hdrs=null, row_hdrs=null, mouseover_data_2d=null, mouseover_col_hdrs=null, mouseover_row_hdrs=null, data_2d_bgc=null)
{
	//let my_parent = document.getElementById(parent_id);
	//if (my_parent == null) { console.log("ERROR: no element found with id=", parent_id); return null; }

//	let table = null;
//	if (append0_or_replace1) { // replace
//		table_list = my_parent.querySelectorAll("table");
//		table = table_list[ table_list.length-1];
//		while (table.hasChildNodes()) {
//			table.removeChild(table.lastChild);
//		}
//	} else { // append
//		table = document.createElement("table");
//	}

	// Create table-header first
	if (col_hdrs != null) {
		let thead = table_element.createTHead();
		let hrow = thead.insertRow();
		if (row_hdrs != null) { // Create an empty cell above the row headers
				hrow.insertCell();
		}
		for (let col_idx = 0; col_idx < col_hdrs.length; col_idx++) {
			if (mouseover_col_hdrs != null) { // mouseover - need to make a div
				let cell = hrow.insertCell();
				cell.outerHTML = "<th><div title=" + mouseover_col_hdrs[col_idx] + ">"+col_hdrs[col_idx]+"</div></th>";
			} else {
				let cell = hrow.insertCell();
				cell.outerHTML = "<th>"+col_hdrs[col_idx]+"</th>";
			}
		}
	}

	// create table-body
	let tbody = table_element.createTBody();
	for (let row_idx = 0; row_idx < data_2d.length; row_idx++) {
		let body_row = tbody.insertRow(-1);
		if (row_hdrs != null) {
			let header_cell = body_row.insertCell();
			header_cell.outerHTML = "<th>"+row_hdrs[row_idx]+"</th>";
		}
		for (let col_idx = 0; col_idx < data_2d[row_idx].length; col_idx++) {
			let cell = body_row.insertCell();
			cell.innerHTML = data_2d[row_idx][col_idx];
			if (mouseover_data_2d != null) {
				cell.title = mouseover_data_2d[row_idx][col_idx];
			}
			if (data_2d_bgc != null) {
				//cell.bgColor = data_2d_bgc[row_idx][col_idx];
				cell.style.backgroundColor = data_2d_bgc[row_idx][col_idx];
			}
		}
	}

//	my_parent.appendChild(table);
	return table_element;
}





function clagess_create_table_borders( the_table, values)
// Search through the previously created table. Add borders to cells which contain one of the incicated values, but whose neighbor
// doesn't. Add the border only the appropriate border - e.g. the bottom border if on cell has the value and the neighbor below does not.
{
	let number_rows = the_table.rows.length;
	let number_cols = the_table.rows[0].cells.length;
	for (let row_index = 0; row_index < number_rows; row_index++ ) {
		for (let col_index = 0; col_index < number_cols; col_index++ ) {
			if ((row_index+1) < number_rows ) { // check against next row
				let this_value = the_table.rows[row_index  ].cells[col_index].innerText;
				let next_value = the_table.rows[row_index+1].cells[col_index].innerText;
				if (the_table.rows[row_index  ].cells[col_index].nodeName === the_table.rows[row_index+1].cells[col_index].nodeName ) {
					for (value of values) {
						if ( ( (value === this_value) || (value === next_value) ) && (this_value != next_value) ) {
							the_table.rows[row_index  ].cells[col_index].style.borderBottom = "1px solid black";
							the_table.rows[row_index+1].cells[col_index].style.borderTop    = "1px solid black";
						}
					}
				}
			}
			if ((col_index+1) < number_cols ) { // check against next cell (same row)
				if (the_table.rows[row_index].cells[col_index  ].nodeName === the_table.rows[row_index].cells[col_index+1].nodeName ) {
					let this_value = the_table.rows[row_index].cells[col_index  ].innerText;
					let next_value = the_table.rows[row_index].cells[col_index+1].innerText;
					for (value of values) {
						if ( ( (value === this_value) || (value === next_value) ) && (this_value != next_value) ) {
							the_table.rows[row_index].cells[col_index  ].style.borderRight = "1px solid black";
							the_table.rows[row_index].cells[col_index+1].style.borderLeft  = "1px solid black";
						}
					}
				}
			}

		}
	}
}


function format_date(start_year, num_months) // num_months may be much greater than 12.
{
	let the_date = start_year + num_months / 12;
	let the_year = Math.floor( the_date );
	let month = (num_months % 12) + 1;
	return months_user[month] + " " + String( the_year);
}

function ErrorMessage(messages_id, the_message)
{
	console.log("In ErrorMessage(messages_id=", messages_id, ", the_message=", the_message, ")");
	let the_element = document.getElementById(messages_id);
	if (the_element == null) {
		console.log("ERROR - what to do??? messages_id (", messages_id,") in function ErrorMessage(), returns null");
		console.log("ERROR (cont'd): the_message=", the_message);
	}
	console.log("In ErrorMessage(", messages_id, ", ", the_message, "), the_element=", the_element);
	the_element.innerHTML += the_message + "<br>";
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////

// Moved the following out of clagess_generate_table_bank_balance(...) and made global so I could destroy and recreate - to
// allow re-animation via a click-button (it seems I should be able to achieve this without creating globals, but I
// didn't figure that out).
var my_chart = null;
var my_animation = null;
var my_config = null;



// Yuck - would prefer to have the following strings as members of the associated classes - but I had
// a sequencing issue I haven't yet worked out.

const ClaimingAgeTable_description = 
			"Shows potential monthly benefit for each of 96 (8 years X 12 months) potential ages to " +
			"start collecting Social Security Retirement Benefits. " +
			"Considers birth year and month, and PIA.";

const BankBalanceTable_description = 
			"Creates a table and a graph of the same data. " +
			"On a month-by-month basis, shows potential Social Security Retirement Benefits and accumualted bank-balance " +
			"for a scenario or scenarios as selected by the numerous optional arguments.";

const OptimumRetirementClaimingAgeSummaryChart_description = 
			"Creates a table evaluating the affect of investement rate-of-return (aka interest rate), versus " +
			"age for a particular PIA, COLA and other options selectable on the form.";

const ActuaryTable_description =
			"Shows a graph of age versus survival rate for a U.S. individual on his or her 62nd birthday. " +
			"Based on data from the Social Security Administration.";

const Licensing_description = "Some legal notices associated with this software.";


///////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////


class BaseReport { // Base class for a report in the BaseFormReports
	constructor(form_reports, report_name, report_title, list_of_report_arguments = [], description = null) {
		this.the_form = form_reports;
		this.report_name = report_name; // used internally
		this.report_title = report_title; // what's visible to the user
		this.list_of_report_arguments = list_of_report_arguments; // The names (strings) of the arguments
		this.list_of_rows = [] // the FormRow objects: i.e. list_of_report_arguments[] after lookup
		for (let ii=0; ii < list_of_report_arguments.length; ii++) {
			this.list_of_rows.push( form_reports.row_lookup( list_of_report_arguments[ii] ) );
		}
		this.the_form.register_report( this );
		this.description = description;
	}
	name() { return this.report_name; }
	title() { return this.report_title; }

	get_argument( arg_name )
	{
		let the_row = this.the_form.row_lookup( arg_name );
		if (the_row === null) { console.log("ERROR: lookup(", arg_name, ") fails" ); }
		return the_row;
	}

	get_element( arg_name )
	{
		let the_row = this.get_argument(arg_name);
		if (the_row === null) { console.log("ERROR: get_argument(", arg_name, ") fails" ); }
		let the_element = document.getElementById( the_row.form_id );
		return the_element;
	}

	select_rows()
	{
		for (let ii=0; ii < this.list_of_rows.length; ii++) {
			this.list_of_rows[ii].enable_row( true );
		}
	}

	RunReport(parent_id, table_element, canvas_element, error_id, message_id) {
		console.log("BaseReport.RunReport(parent_id=", parent_id, ", table_element=", table_element, "canvas_element=", canvas_element, ", error_id=", error_id, ", message_id=", message_id, ")");
	} // Redefine this in the extended classes.
}


///////////////////////////////////////////////////

class Report_BankBalanceTable extends BaseReport {
	constructor (form_reports) {
		super(form_reports, "BankBalanceTable", "Bank Balance per Month Table",
			["CLAGESS", "Report Type", "Options", "Title", "Birth year", "Birth month", "COLA", "Investment Interest Rate",
					"Claiming-Ages", "PIA", "Age at Death", "Arrears", "Pay Down Balance", "Borrow Interest Rate",
					"Monthly Spending", "Animation Speed", "Max Animation Skew", /*"Table Placement", */
					"Buttons", "Errors", "Messages"],
			BankBalanceTable_description
		);
	}

	RunReport(parent_id, table_element, canvas_element, error_id, message_id)
	{
		if (error_id != null) {
			let error_element = document.getElementById( error_id );
			error_element.innerHTML = "";
		}
		if (message_id != null) {
			let message_element = document.getElementById( message_id );
			message_element.innerHTML = "";
		}

		table_element.classList.add( "clagess_bank_balance_table" );

		let title = this.get_element("Title");
		let birth_year = this.get_element("Birth year");
		let birth_month = this.get_element("Birth month");
		let cola = this.get_element("COLA");
		let interest_rate = this.get_element("Investment Interest Rate");
		//let interest_rate_array = interest_rate.value.trim().split(/\s+/);
		let interest_rate_array = interest_rate.value.split(/\s+/);
		if ( (interest_rate_array.length === 1)  && (interest_rate_array[0] === '') ) { interest_rate_array = [0]; /* This special case of split() doesn't seem correct. */ }
		let claiming_ages = claiming_ages_string_to_values( this.get_element("Claiming-Ages").value );
		let pia = this.get_element("PIA");
		let age_at_death = this.get_element("Age at Death");
		let arrears_checked = this.get_element("Arrears");
		let paydownbalance = this.get_element("Pay Down Balance");
		let borrow_irate = this.get_element("Borrow Interest Rate");
		let spendit = this.get_element("Monthly Spending");
		let animation_speed = this.get_element("Animation Speed");
		let max_animation_skew = this.get_element("Max Animation Skew");


		let new_element = clagess_generate_table_bank_balance( table_element, canvas_element,
			title.value,
			Number(birth_year.value), Number(birth_month.value),
			claiming_ages,
			Number(age_at_death.value),
			//Number(interest_rate.value),
			interest_rate_array,
			Number(cola.value), Number(pia.value),
			Number(arrears_checked.value), error_id,
			Number(paydownbalance.value), Number(borrow_irate.value),
			Number(spendit.value),
			Number(animation_speed.value), Number(max_animation_skew.value)
		);
		return new_element;
	}

}

class Report_ClaimingAgeTable extends BaseReport {
	constructor (form_reports) {
		super(form_reports, "ClaimingAgeTable", "Monthly Retirement Benefit - versus Claiming-Age",
			["CLAGESS", "Report Type", "Title", "Birth year", "Birth month",
					"PIA", /* "Table Placement", */ "Buttons", "Errors", "Messages"],
			ClaimingAgeTable_description
//			"Shows potential monthly benefit for each of 96 (8 years X 12 months) potential ages to " +
//			"start collecting Social Security Retirement Benefits. " +
//			"Considers birth year and month, and PIA."
		);
	}

	RunReport(parent_id, table_element, canvas_element, error_id, message_id)
	{
		let title = this.get_element("Title");
		let birth_year = this.get_element("Birth year");
		let birth_month = this.get_element("Birth month");
		let pia = this.get_element("PIA");
		let new_element = clagess_generate_payment_table( table_element, canvas_element, title.value, Number(birth_year.value), Number(birth_month.value), Number(pia.value) );
		return new_element;
	}
}

class Report_OptimumRetirementClaimingAgeSummaryChart extends BaseReport {
	constructor (form_reports) {
		super(form_reports, "OptimumAgeTable_FV", "Optimum Retirement Claiming Age Summary Chart",
			["CLAGESS", "Report Type", "Options", "Title", "Birth year", "Birth month", "COLA",
					"PIA", /* "Table Placement", */ "Age at Death", "Buttons", "Errors", "Messages"],
			OptimumRetirementClaimingAgeSummaryChart_description
		);
	}
	RunReport(parent_id, table_element, canvas_element, error_id, message_id)
	{
		let title = this.get_element("Title");
		let birth_year = this.get_element("Birth year");
		let birth_month = this.get_element("Birth month");
		let cola = this.get_element("COLA");
		let pia = this.get_element("PIA");
		let age_at_death = this.get_element("Age at Death");
		let new_element = clagess_generate_table_best_bank_balance( table_element, canvas_element,
			Number(birth_year.value), Number(birth_month.value), Number(cola.value), Number(pia.value), Number(age_at_death.value), "form1_errors" );
		// DVO HELP - fix "form1_errors" above
	}
}

class Report_ActuaryTable extends BaseReport {
	constructor (form_reports) {
		super(form_reports, "ActuarialTable_2020", "Actuarial Table - at 62nd birthday",
			["CLAGESS", "Report Type", "Title", "Buttons", "Errors", "Messages"],
			ActuaryTable_description
		);
	}
	RunReport(parent_id, table_element, canvas_element, error_id, message_id)
	{
		let title = this.get_element("Title");
		let age_at_death = this.get_element("Age at Death");
		let new_element = clagess_generate_actuarial_table(  table_element, canvas_element, title.value, Number(age_at_death.value) );
	}
}

class Report_Licensing extends BaseReport {
	constructor (form_reports) {
		super(form_reports, "Licensing", "Licensing and Copyright notices",
			["CLAGESS", "Report Type", "Buttons", "Errors", "Messages"],
			Licensing_description
		 );
	}
	RunReport(parent_id, table_element, canvas_element, error_id, message_id)
	{
		clagess_licensing( parent_id );
	}
}


var the_form_reports = null;
///////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////

class FormRow
{
	static id_index = 1000;
	constructor(form_reports_parent, name, can_be_disabled, element_stuff, arg_check_func = null ) {
		//console.log("FormRow.constructor: form_reports_parent=", form_reports_parent, ", typeof=", typeof form_reports_parent );
		FormRow.id_index++;
		this.row_name = name;
		this.element_stuff = element_stuff;
		this.row_id = "FormRow_row_id_" + String(FormRow.id_index); // for the entire row 
		this.form_id = "FormRow_form_id_" + String(FormRow.id_index); // for the form element (if any)
		this.rowclass = "FormRow_rowclass_" + String(FormRow.id_index); // for the entire row
		this.can_be_disabled = can_be_disabled;
		this.arg_check = arg_check_func;
		form_reports_parent.register_row( this );
		//this.DebugDump();
		//console.log("    End of FormRow.constructor()");
	}

	DebugDump() {
		console.log("FormRow.DebugDump(): ");
		console.log("    row_name=", this.row_name );
		console.log("    element_stuff=", this.element_stuff );
		console.log("    row_id=", this.row_id );
		console.log("    form_id=", this.form_id );
		console.log("    rowclass=", this.rowclass );
		console.log("    can_be_disabled=", this.can_be_disabled );
		console.log("    arg_check=", this.arg_check );
	}

	enable_row( enable=true ) {
		if (this.can_be_disabled) {
			if (enable) {
				elements_list_alter_classes( document.getElementsByClassName( this.rowclass ), ["clagess_disabled_row"], [] );
			} else {
				elements_list_alter_classes( document.getElementsByClassName( this.rowclass ), [], ["clagess_disabled_row"] );
			}
			let the_element = document.getElementById( this.row_id );
			if (the_element !== null) { the_element.disabled = ! enable; }
		}
	}

	hide_row( enable=true ) {
		if (this.can_be_disabled) {
			if (enable) {
				elements_list_alter_classes( document.getElementsByClassName( this.rowclass ), ["clagess_hidden_row"], [] );
			} else {
				elements_list_alter_classes( document.getElementsByClassName( this.rowclass ), [], ["clagess_hidden_row"] );
			}
			let the_element = document.getElementById( this.row_id );
			if (the_element !== null) { the_element.disabled = ! enable; }

			let the_form_element = document.getElementById( this.form_id );
			if (the_form_element !== null) { the_form_element.disabled = ! enable; }
		}
	}

	name() {
		return this.row_name;
	}
	get_value()
	{
		let the_element = document.getElementById(this.form_id);
		return the_element.value;
	}

	check_arg() // Returns an error message - or null if no error
	{
		if (this.arg_check !== null) {
			let the_value = this.get_value();
			return this.arg_check( the_value );
		}
		return null;
	}

	Render( the_table_body, the_form ) {
		let table_row = the_table_body.insertRow(-1);
		table_row.classList.add( this.rowclass );
		table_row.id = this.row_id;


		let first_element = table_row.insertCell(-1);
		//first_element.innerHTML = this.name();

		let parent_element = first_element;
		let latest_element = first_element;
		for (let ii=0; ii < this.element_stuff.length; ii+=2) {
			const attr  = this.element_stuff[ii];
			const value = this.element_stuff[ii+1];

			if (attr === "element") {
				latest_element = document.createElement(value);
				parent_element.appendChild(latest_element);
			} else if (attr === "element2") {
				latest_element = document.createElement(value);
				parent_element.appendChild(latest_element);
				parent_element = latest_element;
			} else if (attr === "element3") {
				let new_element = document.createElement(value);
				parent_element.appendChild(new_element);
				latest_element = new_element;
			} else if (attr === "pop") {
				return latest_element = parent_element;
			} else if (attr === "nextCell") {
				latest_element = table_row.insertCell(-1);
				parent_element = latest_element;
			} else if (attr === "form_id") {
				latest_element.setAttribute("id", this.form_id );
			} else if (attr === "click") {
				latest_element.addEventListener("click", value );
			} else if (attr === "onchange") {
				latest_element.addEventListener("change", value );
			} else if (attr === "trclassadd") {
				table_row.classList.add(value);
			} else if (attr === "classadd") {
				parent_element.classList.add(value);
			} else if (attr === "innerHTML") {
				latest_element.innerHTML = value;
			} else if (attr === "outerHTML") {
				latest_element.outerHTML = value;
			} else if (attr === "innerText") {
				latest_element.innerText = value;
			} else if (attr === "outerText") {
				latest_element.outerText = value;
			} else {
				latest_element.setAttribute(attr,value);
			}
		} // for ii
	} // Render()
}


class ClagessFormRow extends FormRow
{
	constructor(form_reports_parent, name, can_be_disabled, element_stuff, display_level = 0, arg_check_func = null ) {
		super( form_reports_parent, name, can_be_disabled, element_stuff, arg_check_func );
		this.display_level = display_level;
	}

	on_arg_change() // Error messages - if any - go into the 3rd column (normally blank)
	{
		let table_row_element = document.getElementById ( this.row_id );
		if (table_row_element != null) {
			if (table_row_element.cells.length >= 3) {
				table_row_element.cells[2].innerHTML = "";
				let error_message = this.check_arg();
				if (error_message !== undefined) {
					table_row_element.cells[2].innerHTML = error_message;
				}
			}
		}
	}
}



////////////////////////////////////////////////
////////////////////////////////////////////////

class BaseFormReports // Represents a Table, and FORM for one or more related reports - each report having some number of arguments/paremeters
		// that a user my select via this Table and FORM.
{
	constructor (parent_id, error_id=null, message_id=null) {
		this.list_of_rows = [];
		this.row_lookup_table = {};
		this.list_of_reports = [];
		this.error_id = error_id;
		this.message_id = message_id;
		this.report_desc_id = null;
	}
	register_row( new_form_row ) {
		this.list_of_rows.push( new_form_row );
		this.row_lookup_table[ new_form_row.name() ] = new_form_row;
	}
	register_report( new_form_report )
	{
		this.list_of_reports.push( new_form_report );
	}

	DebugDump()
	{
		console.log("BaseFormReports.DebugDump(): this.list_of_rows.length=", this.list_of_rows.length);
		for (let zz=0; zz< this.list_of_rows.length; zz++) {
			console.log("    row ", zz, ": ", this.list_of_rows[zz].name() );
		}
		for (ele in this.row_lookup_table) {
			console.log("    element=", ele);
		}
		for (let zz=0; zz< this.list_of_reports.length; zz++) {
			console.log("    report ", zz, ": ", this.list_of_reports[zz].name() );
		}
		console.log("    error_id=", this.error_id );
		console.log("    message_id=", this.message_id );
		console.log("    report_desc_id=", this.report_desc_id );
		console.log("End of BaseFormReports.DebugDump()");
	}

	row_lookup( row_name )
	{
		let the_lookup_result = this.row_lookup_table[row_name];
		if (the_lookup_result === undefined) {
			console.log("ERROR BaseFormReports.row_lookup(row_name=", row_name, ") failed. this=", this );
			return null;
		}
		return the_lookup_result;
	}

	get_argument( arg_name )
	{
		let the_row = this.row_lookup(arg_name);
		if (the_row === null) { console.log("ERROR: BaseFormReports.get_argument(", arg_name, ") fails" ); return null; }
		return the_row;
	}

	get_element( arg_name )
	{
		let the_row = this.get_argument( arg_name );
		if (the_row === null) { console.log("ERROR: BaseFormReports.get_argument(", arg_name, ") fails" ); return null; }
		let the_element = document.getElementById( the_row.form_id );
		return the_element;
	}

	report_lookup( report_name )
	{
		for (let zz=0; zz< this.list_of_reports.length; zz++) {
			if ( report_name === this.list_of_reports[zz].name() ) {
				return this.list_of_reports[zz];
			}
		}
		return undefined;
	}

	enable_rows( enable=true )
	{
		for (let zz=0; zz< this.list_of_rows.length; zz++) {
			this.list_of_rows[zz].enable_row( enable );
		}
	}

	get_report_table_id( parent_id )
	{
		return parent_id + "_report_table";
	}

	get_report_canvas_id( parent_id )
	{
		return parent_id + "_report_canvas";
	}

	get_report_table_element( parent_id )
	{
		let my_parent = document.getElementById(parent_id);
		if (my_parent == null) { console.log("ERROR: no element found with id=", parent_id); return null; }

		let report_table_id = this.get_report_table_id( parent_id );
		let report_table = document.getElementById( report_table_id );
		if (report_table !== null) { // Already exists? Should we replace it? (delete and re-create). Mark with a class.
			report_table.remove();

			let report_table_after = document.getElementById( report_table_id );
			report_table = null;
		}


		report_table = document.createElement("table");
		report_table.id = report_table_id;
		my_parent.appendChild(report_table);

		let report_table_again = document.getElementById( report_table_id );
		return report_table;
	}

	// Very similar to get_report_table_element() above - should be refactored.
	get_report_canvas_element( parent_id )
	{
		let my_parent = document.getElementById(parent_id);
		if (my_parent == null) { console.log("ERROR: no element found with id=", parent_id); return null; }

		let report_canvas_id = this.get_report_canvas_id( parent_id );
		let report_canvas = document.getElementById( report_canvas_id );
		if (report_canvas !== null) { // Already exists? Should we replace it? (delete and re-create). Mark with a class.
			report_canvas.remove();

			let report_canvas_after = document.getElementById( report_canvas_id );
			report_canvas = null;
		}


		report_canvas = document.createElement("canvas");
		report_canvas.id = report_canvas_id;
		my_parent.appendChild(report_canvas);

		let report_canvas_again = document.getElementById( report_canvas_id );
		return report_canvas;
	}

	on_action(parent_id)
	{
		let report = this.get_report_type();
		let table_element = this.get_report_table_element ( parent_id );
		let canvas_element = this.get_report_canvas_element ( parent_id );
		console.log("In on_action: get_report_table_element(parent_id=", parent_id, "): ", table_element );
		report.RunReport( parent_id, table_element, canvas_element, this.error_id, this.message_id );
	}

	on_change(parent_id)
	{
		this.disable_all_rows();

		let report = this.get_report_type();
		report.select_rows();

		let report_description = document.getElementById(this.report_desc_id);
		report_description.innerHTML = report.description;
	}

	get_report_type()
	{
		let report_type = this.row_lookup( "Report Type" ); // Yields the name of the selection in the Report Type field.
		let report = this.report_lookup( report_type.get_value() );
		return report;
	}


	RenderTable(the_table_body, the_form)
	{
		for (let zz = 0; zz < this.list_of_rows.length; zz++) {
			this.list_of_rows[zz].Render( the_table_body, the_form );
		}
	}

	disable_all_rows()
	{
		for (let zz = 0; zz < this.list_of_rows.length; zz++) {
			this.list_of_rows[zz].enable_row( false );
		}
	}
} // class BaseFormReports





//////////////////////////////////////////////////////////////////////////////////////////////////////////

class ClagessFormReports extends BaseFormReports
{
	constructor (parent_id) {
		super(parent_id);
		this.create_rows(parent_id);
	}

	DebugDump()
	{
		super.DebugDump();
		console.log("ClagessFormReports.DebugDump():");
		console.log("End of ClagessFormReports.DebugDump()");
	}

	create_rows(parent_id)
	{

	new ClagessFormRow(this, "CLAGESS", false, [  "innerHTML", "CLAGESS", "nextCell", "nop", "colspan", 3,
			"innerHTML", "<b>Cl</b>aiming <b>Ag</b>e <b>E</b>stimator for <b>S</b>ocial <b>S</b>ecurity retirement benefits " +
			"&nbsp;<small>version 0.21</small>",
	], 0);

		// DVO HELP - need to tweak the following to read the reports somehow from the BaseReport objects
	new ClagessFormRow(this, "Report Type", false, [  "innerHTML", "Report Type:", "nextCell", "nop",
		"element2", "select", "form_id", "",
			"name", "form1_reporttype_name",
			"click", () => { this.on_change(parent_id); },
		"title", "Select between several report and chart types. Click and hover for more information.",

		"element3", "option", "innerHTML", "Monthly Retirement Benefit - versus Claiming-Age", "value", "ClaimingAgeTable",
		"title", ClaimingAgeTable_description,

		"element3", "option", "innerHTML", "Bank Balance per Month Table", "value", "BankBalanceTable",
		"title", BankBalanceTable_description,

		"element3", "option", "innerHTML", "Optimum Retirement Claiming Age Summary Chart", "value", "OptimumAgeTable_FV",
		"title", OptimumRetirementClaimingAgeSummaryChart_description,

		"element3", "option", "innerHTML", "Actuarial Table - at 62nd birthday", "value", "ActuarialTable_2020",
		"title", ActuaryTable_description,

		"element3", "option", "innerHTML", "Licensing and Copyright notices", "value", "Licensing",
		"title", Licensing_description,

		"nextCell", "nop",
		"nextCell", "nop", "class", "description",
			"innerHTML", "Select between several report and chart types. Each may present different options in the following rows.",
	"title", "A5",
			"title", "Choose the Report Type first - before selecting from the following options.",
	], 0 );

	let report_desc_row = new ClagessFormRow(this, "", false, [ /*"trclassadd", "clagess_table_row_report_description", */ "nextCell", "nop", "colSpan", 3, "form_id", "", "trclassadd", "description",
	], 0);
		this.report_desc_id = report_desc_row.form_id;

	let arg_options = new ClagessFormRow(this, "Options", true, [ "innerHTML", "Options:", "nextCell", "nop",
		"element2", "select",
			"form_id", "",
			"onchange", () => { this.onchange_options(parent_id); },
		"element3", "option", "innerHTML", "Simplest", "value", 0,
		"element3", "option", "innerHTML", "Standard", "value", 3,
		"element3", "option", "innerHTML", "Advanced", "value", 6,
		"element3", "option", "innerHTML", "Maximum",  "value", 10,
		"nextCell", "nop", "nextCell", "nop", "class", "description",
			"innerHTML", "Selects how many options are displayed. Non-displayed options will use defaults.",
			"title", "Choose Simplest for a minimal interface - but with fewer available options. Some may find the Maximum arguments confusing."
	], 0,
		(value) => { return null; }
	);

	new ClagessFormRow(this, "Title", true, [ "innerHTML", "Title:", "nextCell", "nop",
		"element2", "input", "form_id", "", "type", "text", /*"id", "form1_title_id", */ 
		"nextCell", "nop", "nextCell", "nop", "class", "description",
			"innerHTML", "<b>Optional</b>: Text added to header of generated reports.",
			"title", "Allows you to customize the labeling on these reports for your future reference."
	], 3 );

	let birth_year_row = new ClagessFormRow(this, "Birth year", true, [ "innerHTML", "Birth year:", "nextCell", "nop",
		"element2", "input", "form_id", "", "type", "text", /*"id", "form1_birthyear_id", */
			"onchange", () => { this.onchange_birthdate(parent_id); },
			"onchange", () => { birth_year_row.on_arg_change(birth_year_row.form_id); },
		"nextCell", "nop", "nextCell", "nop", "class", "description",
			"innerHTML", "Affects Full Retirement Age.",
			"title", ""
	], 0,
		(value) => {
				if ( (value < 1900) || (value > 2050)) { return "Birth year="+ value+ ", expecting value of between 1900 and 2050."; }
				return null;
			}
	);

	let birth_month_row = new ClagessFormRow(this, "Birth month", true, [ "innerHTML", "Birth month:", "nextCell", "nop",
		"element2", "select", /* "id", "form1_birthmonth_id",*/
			"form_id", "",
			//"onchange", "form1_onchange_birthdate(" + parent_id + ")",
			"onchange", () => { this.onchange_birthdate(parent_id); },
			"onchange", () => { birth_month_row.on_arg_change(birth_month_row.form_id); },
		"element3", "option", "innerHTML", "Select birth-month", "value", 0,
		"element3", "option", "innerHTML", "January",  "value", 1,
		"element3", "option", "innerHTML", "February", "value", 2,
		"element3", "option", "innerHTML", "March",    "value", 3,
		"element3", "option", "innerHTML", "April",    "value", 4,
		"element3", "option", "innerHTML", "May",      "value", 5,
		"element3", "option", "innerHTML", "June",     "value", 6,
		"element3", "option", "innerHTML", "July",     "value", 7,
		"element3", "option", "innerHTML", "August",   "value", 8,
		"element3", "option", "innerHTML", "September","value", 9,
		"element3", "option", "innerHTML", "October",  "value", 10,
		"element3", "option", "innerHTML", "November", "value", 11,
		"element3", "option", "innerHTML", "December", "value", 12,
		"nextCell", "nop", "nextCell", "nop", "class", "description",
			"innerHTML", "Along with birthyear, determines month of Full Retirement Age (Note: day of month doesn't affect benefit calculations - except if on the first of the month)",
			"title", "For benefit calculations, the SSA uses the previous month if a birthday is on the 1st of a month."
	], 0,
		(value) => {
				if ( (value < 1) || (value > 12)) { return "Birth month="+ value+ ", expecting value of between 1 and 12."; }
				return null;
			}
	);


	let cola_row = new ClagessFormRow(this, "COLA", true, [ "innerHTML", "COLA: (%)", "trclassadd", "clagess_table_row_COLA",
		"nextCell", "nop",
		"element2", "input", "form_id", "", "type", "text", /*"id", "form1_COLA_id", */
		"onchange", () => { cola_row.on_arg_change(cola_row.form_id); },
		"nextCell", "nop", "nextCell", "nop", "class", "description",
			"innerHTML", "<b>Optional</b>: Your <i>estimate</i> of the annual Cost Of Living Adjustment (which helps counter inflation).",
			"title", ""
	], 3,
		(value) => {
				if ( (value < -20) || (value > 20)) { return "COLA="+ value+ ", expecting a value of a few percent."; }
				return null;
			}
	);


	let irate_row = new ClagessFormRow(this, "Investment Interest Rate", true,[ "innerHTML", "Investment Interest Rate: (%)", "trclassadd", "clagess_table_row_invest_interest",
		"nextCell", "nop",
		"element2", "input", "form_id", "", "type", "text", /*"id", "form1_interest_id", */
		"onchange", () => { irate_row.on_arg_change(irate_row.form_id); },
		"nextCell", "nop", "nextCell", "nop", "class", "description",
		"innerHTML", "<b>Optional</b>: Your <i>estimate</i> of the annual interest rate to be paid on a <i>positive</i> bank balance. Note: also see <b>Borrow Interest Rate</b>",
		"title", ""
	], 3,
		(value) => { // DVO HELP - can be a range of values - this code doesn't allow for that.
				if ( (value < -20) || (value > 40)) { return "Investment Interest Rate="+ value+ ", expecting a value of a few percent."; }
				return null;
			}
	);


	let claiming_ages_row = new ClagessFormRow(this, "Claiming-Ages", true, [ "innerHTML", "Claiming-Ages", "trclassadd", "clagess_table_row_claimingages",
		"nextCell", "nop",
		"element2", "input", "form_id", "", "type", "text", /*"id", "form1_claiming_id",*/ "value", "62 67 70",
		//"onchange", "form1_onchange_claiming_ages(\"form1_claiming_id\")", // DVO HELP
		"onchange", () => { this.onchange_claiming_ages(); },
		"onchange", () => { claiming_ages_row.on_arg_change(claiming_ages_row.form_id); },
		"nextCell", "nop", "nextCell", "nop", "class", "description",
		"innerHTML", "A list of claiming-ages - in year:month format - for which to include in table. 64:5 means 5 months after 64th birthday. " +
				"67 is the same as 67:0. Note: a <i>start stop increment</i> format is also supported - here's an example of this special case: <b>62 64 :6</b> means 62 62:6 63 63:6 64.",
		"title", ""
	], 0,
		(value) => { /* DVO HELP todo - add checking here */
				return null;
			}
	);


	let pia_row = new ClagessFormRow(this, "PIA", true, ["innerHTML", "PIA - monthly benefit at Full Retirement Age: ($)", "trclassadd", "clagess_table_row_pia",
		"nextCell", "nop",
		"element2", "input", "form_id", "", "type", "text", /*"id", "form1_pia_id", */ "value", "1000",
		"onchange", () => { pia_row.on_arg_change(pia_row.form_id); },
		"nextCell", "nop", "nextCell", "nop", "class", "description",
		"innerHTML", "Primary Insurance Amount is the amount that the SSA calculates as your benefit at your Full Retirement Age." +
				"<br>You may find this listed as <b>Your monthly benefit at Full Retirement Age</b> on your  <i>my Social Security</i> under <b>Plan For Retirement</b> after logging onto <a href=\"https://www.ssa.gov/\">www.ssa.gov</a>.",
		"title", ""
	], 0,
		(value) => {
				if ( (value < 0) || (value > 10000)) { return "PIA="+ value+ ", value seems out of range."; }
				return null;
			}
	);


	let aad_row = new ClagessFormRow(this, "Age at Death", true, [ "innerHTML", "Age at Death", "trclassadd", "clagess_table_row_age_at_death",
		"nextCell", "nop",
		"element2", "input", "form_id", "", "type", "text", /* "id", "form1_ageatdeath_id", */ "value", "100",
		"onchange", () => { aad_row.on_arg_change(aad_row.form_id); },
		"nextCell", "nop", "nextCell", "nop", "class", "description",
		"innerHTML", "<b>Optional</b>: Estimated age at death (year:month). Note that the SSA does NOT pay a benefit for the month of death.",
		"title", ""
	], 3,
		(value) => { // DVO HELP - how to check?
				return null;
			}
	);


	new ClagessFormRow(this, "Arrears", true, [ "innerHTML", "Arrears", "trclassadd", "clagess_table_arrears",
		"nextCell", "nop",
		"element3", "input", "form_id", "", "type", "radio", "name", "form1_arrears_name", /* "id", "form1_arrears_id_0",*/ "value", 0, "checked", "true",
		"element3", "label", "innerHTML", "When Due ",

		"element3", "input", "type", "radio", "name", "form1_arrears_name", /* "id", "form1_arrears_id_1",*/ "value", 1, // DVO HELP - two ids
		"element3", "label", "innerHTML", "When Paid ",

		"nextCell", "nop", "nextCell", "nop", "class", "description",
		"innerHTML", "<b>Optional</b>: Benefits are typically paid a month later. " +
				"For example, the benefit payment received in July is typically the June benefit. " +
				"For simplicity, most reports here do NOT consider this delay - this is the \"When Due\" default. " +
				"If \"When Paid\" is enabled, the report will consider that delay.",
		"title", ""
	], 6);


	let pdb_row = new ClagessFormRow(this, "Pay Down Balance", true, [ "innerHTML", "Pay Down Balance: ($):", "trclassadd", "clagess_table_row_paydownbalance",
		"nextCell", "nop",
		"element2", "input", "form_id", "", "type", "text", /* "id", "form1_paydownbalance_id", */ "value", 0,
		"onchange", () => { pdb_row.on_arg_change(pdb_row.form_id); },
		"nextCell", "nop", "nextCell", "nop", "class", "description",
		"innerHTML", "<b>Optional</b>: For the situation where the claimant has an outstanding loan, perhaps credit-card or a mortgage. " +
	      			"This is the outstanding balance on that loan. Calculations assume Social Security benefits will be used to pay down this loan.",
	      	"title", ""
	], 6,
		(value) => {
				if ( (value < -10000000) || (value > 10000000)) { return "Pay Down Balance="+ value+ ", values seems out of range."; }
				return null;
			}
	);


	let b_irate = new ClagessFormRow(this, "Borrow Interest Rate", true, [ "innerHTML", "Borrow Interest Rate: (%)", "trclassadd", "clagess_table_row_borrow_irate",
		"nextCell", "nop",
		"element2", "input", "form_id", "", "type", "text", /* "id", "form1_borrow_irate_id", */ "value", 0,
		"onchange", () => { b_irate.on_arg_change(b_irate.form_id); },
		"nextCell", "nop", "nextCell", "nop", "class", "description",
		"innerHTML", "<b>Optional</b>: The annual interest rate on the any borrowed amount - such as with <b>Pay Down Balance</b>.",
	      	"title", ""
	], 6,
		(value) => {
				if ( (value < -20) || (value > 40)) { return "Borrow Interest Rate="+ value+ ", values seems out of range."; }
				return null;
			}
	);

	let spend_it = new ClagessFormRow(this, "Monthly Spending", true, [ "innerHTML", "Monthly Spending: ($)", "trclassadd", "clagess_table_row_spendit",
		"nextCell", "nop",
		"element2", "input", "form_id", "", "type", "text", /* "id", "form1_spendit_id", */ "value", 0,
		"onchange", () => { spend_it.on_arg_change(spend_it.form_id); },
		"nextCell", "nop", "nextCell", "nop", "class", "description",
		"innerHTML", "<b>Optional</b>: Monthly spending. The report deducts this from your bank balance. " +
				"If balance is negative, the <b>Borrow Interest Rate (%)</b> is applied.",
	      	"title", ""
	], 6,
		(value) => {
				if ( (value < -99999) || (value > 100000)) { return "Monthly Spending="+ value+ ", values seems out of range."; }
				return null;
			}
	);


	let a_speed = new ClagessFormRow(this, "Animation Speed", true, [ "innerHTML", "Animation Speed", "trclassadd", "clagess_table_row_animation_speed",
		"nextCell", "nop",
		"element2", "input", "form_id", "", "type", "text", /* "id", "form1_animation_speed_id", */ "value", 0,
			//"onchange", "form1_onchange_report(" + parent_id + ")",
			"onchange", () => { this.on_change(parent_id); },
		"onchange", () => { a_speed.on_arg_change(a_speed.form_id); },
		"nextCell", "nop", "nextCell", "nop", "class", "description",
		"innerHTML", "<b>Optional</b>: 0 disables animation of the chart. Try 100 and then increase or decrease as desired.",
	      	"title", ""
	], 8,
		(value) => { // DVO HELP - add range checking
				return null;
			}
	);


	new ClagessFormRow(this, "Max Animation Skew", true, [ "innerHTML", "Max Animation Skew", "trclassadd", "clagess_table_row_max_animation_skew",
		"nextCell", "nop",
		"element2", "input", "type", "text", /* "id", "form1_max_animation_skew_id", */ "value", 3000, "form_id", "",
		"nextCell", "nop", "nextCell", "nop", "class", "description",
		"innerHTML", "<b>Optional</b>: A work-around for a known bug in Chart.js. Not used unless <b>Animation Speed</b> is enabled. " +
				"Increase this value if you see an error about <b>animation delay</b> or <b>max_animation_skew</b>. " +
				"Otherwise ignore this parameter.",
	      	"title", ""
	], 8,
	);


	new ClagessFormRow(this, "Buttons", false, [ "element", "button", "type", "submit", "innerHTML", "Create Report",
		"form_id", "", "click", () => { this.on_action(parent_id); },
		"nextCell", "nop",
		"nextCell", "nop", "nextCell", "nop", "class", "description",
		"innerHTML", "",
		"title", ""
	], 0
	);

	let error_row = new ClagessFormRow(this, "Errors", false, [ "trclassadd", "clagess_table_row_error", "colSpan", 4, "form_id", "", /* "id", "clagess_input_form_errors", */
	], 0);
		this.error_id = error_row.form_id;

	let message_row = new ClagessFormRow(this, "Messages", false, [ "trclassadd", "clagess_table_row_messages", "colSpan", 4, "form_id", "", /* "id", "clagess_input_form_messages", */
	], 0);
		this.message_id = message_row.form_id;

	} // create_rows()
	
	onchange_birthdate(parent_id)
	{
		let my_parent = document.getElementById(parent_id);

		//this.DebugDump();

		let the_message_element = document.getElementById(this.message_id);
		if (the_message_element == null) {
			console.log("ERROR - what to do??? message_id (", this.message_id,") in function ClagessFormReports.onchange_birthdate(), returns null");
		}

		let birth_year = this.get_element("Birth year");
		let birth_month = this.get_element("Birth month");

		if ( (Number(birth_year.value) >= 1900) && (Number(birth_year.value) < 2100) ) {
			let full_retirement_age = clagess_full_retirement_age(Number(birth_year.value));
			the_message_element.innerHTML = "Full retirement age: " + clagess_to_years_months( full_retirement_age, 1 );
		} else {
			the_message_element.innerHTML = ""; // erase anything already written
		}
	}

	onchange_claiming_ages()
	{
		console.log("ClagessFormReports.onchange_claiming_ages()");

		let claiming_ages = document.getElementById(claiming_age_id);
		if (claiming_ages == null) { console.log("ERROR - what to do??? claiming_age_id (", claiming_age_id,") in function form1_onchange_claiming_ages(), returns null"); }

		claiming_age_id = this.get_element("Claiming-Ages");

		console.log("claiming_age_id=", claiming_age_id );

		let  claiming_age_values = claiming_ages_string_to_values( claiming_ages.value );
		console.log("    claiming_ages.value=", claiming_ages.value );
		console.log("    claiming_age_values=", claiming_age_values );

		if ((claiming_age_values.length == 3) && (claiming_age_values[0] < claiming_age_values[1]) &&  (claiming_age_values[2] < claiming_age_values[1]) ) {
			let start = claiming_age_values[0];
			let stop = claiming_age_values[1];
			let increment = claiming_age_values[2];
			let new_list = [];
			let new_string1 = ""
			let new_string2 = ""
			for (let the_value = claiming_age_values[0]; the_value <= claiming_age_values[1]; the_value += claiming_age_values[2] ) {
				new_list.push( the_value );
				new_string1 += string_ycm_to_num( String(the_value) ) + " ";
				new_string2 += clagess_to_years_months( the_value, 3 )    + " ";
			}
			claiming_ages.value = new_string2;
			console.log("    new string=", claiming_ages.value );
		}
	}

	onchange_options( parent_id )
	{
		let options_level = this.get_element("Options").value;
		for (let row of this.list_of_rows) {
			let display_it = (row.display_level <= options_level);
			row.hide_row( display_it );
		}
	}


} // class ClagessFormReports




///////////////////////////////////////////////////////////////////////////////////////////////////////

function clagess_generate_payment_table( table_element, canvas_element, title, birth_year, birth_month_user, pia=1000 )
{
	if (0) { console.log("Enter clagess_generate_payment_table(table_element=", table_element, ", canvas_element=", canvas_element, ", title=", title, ", birth_year=", birth_year, ", birth_month_user=", birth_month_user, ", pia=", pia, ")"); }

	//let my_parent = document.getElementById(parent_id);
	//if (my_parent == null) { console.log("ERROR: no element found with id=", parent_id); return null; }

	//let table = null;
	//if (append0_or_replace1) { // replace
//		table_list = my_parent.querySelectorAll("table");
//		table = table_list[ table_list.length-1];
//		while (table.hasChildNodes()) { // clear out the existing table
//			table.removeChild(table.lastChild);
//		}
//		table.classList.add("replaced");
//	} else {
//		table = document.createElement("table");
//		table.id = "appended";
//		table.classList.add("appended");
//	}
//	table.id = "clagess_payment_table";
	table_element.classList.add("clagess_payment_table");


	clagess_set_birth_year( birth_year ); // initializes clagess_monthly_benefit[]
	let full_retirement_age = clagess_full_retirement_age( birth_year );
	let full_retirement_index = (full_retirement_age-62) * 12;

	// Create table-header first
	let thead = table_element.createTHead();
	let hrow1 = thead.insertRow();

	// The header row
	let cell = hrow1.insertCell();
	cell.outerHTML = "<th></th>";

	cell = hrow1.insertCell();
	cell.outerHTML = "<th>Claiming Age (years:months)</th>";

	cell = hrow1.insertCell();
	cell.outerHTML = "<th>Claiming Date</th>";

	cell = hrow1.insertCell();
	cell.outerHTML = "<th>Early, Normal or Late Retirement - per SSA</th>";

	cell = hrow1.insertCell();
	cell.outerHTML = "<th>Monthly Retirement Benefit (based on PIA=$" + parseFloat(pia).toFixed(2) + ") Note: benefits are paid the following month.</th>";

	cell = hrow1.insertCell();
	cell.outerHTML = "<th>Monthly Benefit Increase from previous month</th>";

	cell = hrow1.insertCell();
	cell.outerHTML = "<th>Monthly Benefit Increase from 12-months earlier</th>";

	cell = hrow1.insertCell();
	cell.outerHTML = "<th>Ratio to Monthly Benefit claimed at age 62</th>";

	cell = hrow1.insertCell();
	cell.outerHTML = "<th>Ratio to Full Retirement Benefit (i.e. claimed at age " + clagess_to_years_months(full_retirement_age, 3) + ")</th>";

	cell = hrow1.insertCell();
	cell.outerHTML = "<th>Ratio to Maximum Retirement Benefit (i.e. claimed at age 70)</th>";

	cell = hrow1.insertCell();
	cell.outerHTML = "<th>Payback time (months) for delaying from previous month</th>";

	// create table-body
	let tbody = table_element.createTBody();
	let labels = []; // for plotting - X axis labels
	let dollar_amount = []; // for plotting - the data values
	for (let months_after_62 = 0; months_after_62 <= (8*12); months_after_62++) { // each row
		labels.push( format_date(birth_year+62, birth_month_user-1+months_after_62 ) +  " " + clagess_to_years_months(62+months_after_62/12, 2) );

		let body_row = tbody.insertRow(-1);
		let header_cell = body_row.insertCell();
		header_cell.outerHTML = "<th>" + (months_after_62+1) + "</th>";

		header_cell = body_row.insertCell();
		header_cell.innerHTML = clagess_to_years_months( 62 + months_after_62/12, 2);

		header_cell = body_row.insertCell();
		header_cell.innerHTML = format_date(birth_year+62, birth_month_user-1+months_after_62);
		
		header_cell = body_row.insertCell();
		if (months_after_62 < full_retirement_index) { header_cell.innerHTML = "Early"; }
		else if (months_after_62 == full_retirement_index) { header_cell.innerHTML = "Normal"; }
		else { header_cell.innerHTML = "Late"; }

		let cell = body_row.insertCell();
		this_months_dollars = parseFloat( clagess_monthly_benefit[months_after_62].benefit * pia ).toFixed(2);
		cell.innerHTML = "$" + this_months_dollars;
		dollar_amount.push( this_months_dollars );

		cell = body_row.insertCell();
		cell.innerHTML = (months_after_62 == 0) ? "" :
				(parseFloat( 100*clagess_monthly_benefit[months_after_62].benefit / clagess_monthly_benefit[ months_after_62-1].benefit -100 ).toFixed(2) + "%");

		cell = body_row.insertCell();
		cell.innerHTML = (months_after_62 < 12) ? "" :
				(parseFloat( 100*clagess_monthly_benefit[months_after_62].benefit / clagess_monthly_benefit[ months_after_62-12].benefit -100 ).toFixed(2) + "%");

		cell = body_row.insertCell();
		cell.innerHTML = parseFloat( (100* clagess_monthly_benefit[months_after_62].benefit / clagess_monthly_benefit[0].benefit )).toFixed(1) + "%";

		cell = body_row.insertCell();
		cell.innerHTML = parseFloat( 100* clagess_monthly_benefit[months_after_62].benefit / clagess_monthly_benefit[ full_retirement_index ].benefit ).toFixed(1) + "%";

		cell = body_row.insertCell();
		cell.innerHTML = parseFloat( 100* clagess_monthly_benefit[months_after_62].benefit / clagess_monthly_benefit[ 8*12 ].benefit ).toFixed(1) + "%";

		// Calc payback time in months for delaying from previous month
		cell = body_row.insertCell();
		if (months_after_62 == 0) {
			cell.innerHTML = ""; 
		} else {
			let delta_benefit =  clagess_monthly_benefit[months_after_62].benefit - clagess_monthly_benefit[months_after_62-1].benefit;
			let ratio = clagess_monthly_benefit[months_after_62-1].benefit / delta_benefit; 
			cell.innerHTML = parseFloat( ratio ).toFixed(0);
		}

	} // for months_after_62

//	if (append0_or_replace1 == 0) { my_parent.appendChild(table); }
	table_caption = table_element.createCaption();
	table_caption.innerHTML = "Monthly Retirement benefit, based on PIA=$<b>" + String(pia) + "</b> for claimant born in <b>" + months_user[birth_month_user] + " " + String(birth_year) + "</b>.";
	if (title !== '') {
		table_caption.innerHTML = title + "<br>" + table_caption.innerHTML;
	}



	let datasets = []; // for plotting - list of datasets where each dataset represents a single plot-line for each claiming-age -
				// containing the actual (Y values) data in an array named data.
	datasets.push( { label: "Monthly retirement benefit", fill: false, borderWidth: 0.5, borderDash: [5, 8], data: dollar_amount  } );

	if (canvas_element !== null) { // plot
		//let ctx = document.createElement("canvas");
		//ctx.id = "myChart";
		////my_parent.appendChild(ctx);
		my_config = {
			type: "line",
			data: { labels: labels, datasets: datasets },
			options: {
				plugins: {
					title: {
						display: true,
						text: "Claiming-Age's affect on monthly Social Security Retirement Benefits"
					},
					subtitle: {
						display: true,
						text: "Born: " + String(months_user[birth_month_user]) + " " + String(birth_year) + ", PIA: $" + String(pia),
					},
					tooltip: {
						callbacks: {
							label: function(context) {
								if (context.parsed.y !== null) {
									let dollars = new Intl.NumberFormat("en-US", {
										style:"currency",
										maximumFractionDigits:0,
										currency:"USD"
									}).format(context.parsed.y);
									return "Monthly retirement benefit=" + dollars;
								}
								return undefined;
							}
						}
					},
					annotation: {
						annotations: {
							line1: {
								type: 'line',
								xMin: full_retirement_index,
								xMax: full_retirement_index,
								borderColor: 'green',
								borderWidth: 1,
								borderDash: [10,5],
							},
							label1: {
								type: 'label',
								xValue: full_retirement_index,
								yValue: pia * (1 - (1-clagess_monthly_benefit[0].benefit) * 0.5),
								content: ["Full Retirement Age", clagess_to_years_months(full_retirement_age, 4)],
								rotation: 270,
							}
						},
					},
				},
				scales : {
					y: {
						ticks: {
							callback: value => new Intl.NumberFormat("en-US", {style:"currency",
								currency:"USD",
								maximumFractionDigits:0
							}).format(value)
						}
					}
				},
				//animation: my_animation,
				onClick: (e) => {
					if (my_chart != null) {
						my_chart.destroy();
						my_chart = new Chart( canvas_element.getContext("2d"), my_config );
					}
				}
			}
		}
		my_chart = new Chart(canvas_element.getContext("2d"), my_config );
	}

	return table_element;
}


function clagess_generate_table_bank_balance( the_table, the_canvas, title, birth_year, birth_month_user=1,
	claiming_age_array, max_age, interest_percent_array=[0],
	cola_percent=0, pia=1000, arrears=0, messages_id=null,
	paydownbalance=0, borrow_irate=0, spendit=0, animation_speed=0, max_animation_skew_ms = 3000)
// birth_month_user should be 1..12
// claiming_age_array - array of values indicating year (and perhaps fractional month) - so 64+5/12 (=64.4166) means at age 64 years and 5 months.
// arrears: SSA pays benefits about 1 month in arrears (i.e. February benefits are paid in March, etc.). Arrears=0 means to calculate and show
// 	based on when benefits are earned (i.e. not in arrears). arrears=1 means to calculate and show based on when benefits are received
// 	(i.e. in arrears).
{
	if (0) {console.log("Enter clagess_generate_table_bank_balance(the_table=", the_table, ", the_canvas=", the_canvas,
		", title=", title,
		", birth_year=", birth_year, ", birth_month_user=", birth_month_user, ", claiming_age_array=", claiming_age_array,
		", max_age=", max_age, ", interest_percent_array=", interest_percent_array, ", cola_percent=", cola_percent,  ", pia=", pia,
		", arrears=", arrears, ", messages_id=", messages_id,
		", paydownbalance=", paydownbalance, ", borrow_irate=", borrow_irate,
		", spendit=", spendit, ", animation_speed=", animation_speed, ", max_animation_skew_ms=", max_animation_skew_ms, ")" );
	}
	//let my_parent = document.getElementById(parent_id);
	//if (my_parent == null) { console.log("ERROR: no element found with id=", parent_id); return null; }

	let alert_counter = 0; // To avoid seemingly endless error messages in some situations.

	//let claiming_age_array_cleaned = claiming_ages_string_to_values( claiming_age_array );
	let claiming_age_array_cleaned = claiming_age_array;

	if (true) { // argument checking
		let error_count = 0;
//		if (!isNumber(append0_or_replace1) ||  (append0_or_replace1 < 0) || (append0_or_replace1 > 1)) {
//			ErrorMessage(messages_id, "ERROR: append0_or_replace1="+ append0_or_replace1+ ", expecting value of either 0 or 1.");
//			error_count++;
//		}
		if (!isNumber(birth_year) || (birth_year < 1900) || (birth_year > 2050)) {
			ErrorMessage(messages_id, "ERROR: birth_year="+ birth_year+ ", expecting value of between 1900 and 2050.");
			error_count++;
		}
		if (!isNumber(birth_month_user) || (birth_month_user < 1) || (birth_month_user > 120)) {
			ErrorMessage(messages_id, "ERROR: birth_month_user="+birth_month_user+ ", expecting value of between 1 and 12.");
			error_count++;
		}
		if (claiming_age_array_cleaned.length < 1) {
			ErrorMessage(messages_id, "ERROR: claiming_are_array's length="+ claiming_array_array.length+ ", expecting length of at least 1");
			error_count++;
		}
		if (!isNumber(max_age) || (max_age < 62) || (max_age > 200) ) {
			ErrorMessage(messages_id, "ERROR: max_age="+ max_age+ ", expecting value >= 62 and < 150.");
			error_count++;
		}
		for (irate of interest_percent_array) {
			let irateV = Number(irate);
			if (!isNumber(irateV) || (irateV < -100) || (irateV > 1000) ) {
				ErrorMessage(messages_id, "ERROR: interest_percent="+ irateV+ "%, seems out of range of reasonable values.");
				error_count++;
				break;
			}
		}
//		if (!isNumber(interest_percent) || (interest_percent < -100) || (interest_percent > 1000) ) {
//			ErrorMessage(messages_id, "ERROR: interest_percent="+ interest_percent+ "%, seems out of range of reasonable values.");
//			error_count++;
//		}
		if (!isNumber(cola_percent) || (cola_percent < -100) || (cola_percent > 1000) ) {
			ErrorMessage(messages_id, "ERROR: cola_percent="+ cola_percent+ "%, seems out of range of reasonable values.");
			error_count++;
		}
		if (!isNumber(pia) || (pia < 0) || (pia > 50000) ) {
			ErrorMessage(messages_id, "ERROR: pia=$"+ pia+ ", seems out of range of reasonable values.");
			error_count++;
		}
		if (!isNumber(arrears) || (arrears < 0) || (arrears > 1) ) {
			ErrorMessage(messages_id, "ERROR: arrears="+ arrears+ ", expecting value of either 0 or 1.");
			error_count++;
		}
		if (!isNumber(paydownbalance) || (paydownbalance < 0) || (paydownbalance > 10000000) ) {
			ErrorMessage(messages_id, "ERROR: paydownbalance=$"+ paydownbalance+ ", seems out of range of reasonable values.");
			error_count++;
		}
		if (!isNumber(borrow_irate) || (borrow_irate < 0) || (borrow_irate > 25) ) {
			ErrorMessage(messages_id, "ERROR: borrow_irate=%"+ borrow_irate+ ", seems out of range of reasonable values.");
			error_count++;
		}
		if (!isNumber(spendit) || (spendit < 0) || (spendit > 10000) ) {
			ErrorMessage(messages_id, "ERROR: spendit=$"+ spendit+ ", seems out of range of reasonable values.");
			error_count++;
		}

		if (!isNumber(animation_speed) || (animation_speed < 0) || (animation_speed > 10000) ) {
			ErrorMessage(messages_id, "ERROR: animation_speed="+ animation_speed+ ", seems out of range of reasonable values.");
			error_count++;
		}
		if (!isNumber(max_animation_skew_ms) || (max_animation_skew_ms < 0) || (max_animation_skew_ms > 100000) ) {
			ErrorMessage(messages_id, "ERROR: max_animation_skew="+ max_animation_skew_ms+ ", seems out of range of reasonable values.");
			error_count++;
		}

		if (error_count > 0) {
			return null;
		}
	}


	if (0) {
	let table = null;
	if (append0_or_replace1) { // replace
		table_list = my_parent.querySelectorAll("table");
		table = table_list[ table_list.length-1];
		while (table.hasChildNodes()) { // clear out the existing table
			table.removeChild(table.lastChild);
		}
		table.classList.add("replaced");
	} else {
		table = document.createElement("table");
		table.id = "appended";
		table.classList.add("appended");
	}
	table.id = "clagess_bank_balance_table";
	table.classList.add("generated");
	}


	let benefit = []; // index by column combination of claiming age and interest-rate
	let balance = []; // same index as in benefit[]


	clagess_set_birth_year( birth_year );
	for (claiming_age of claiming_age_array_cleaned) {
		for (irate of interest_percent_array) {
			let months_after_62 = Math.round( (claiming_age - 62) * 12 );
			benefit.push( clagess_monthly_benefit[months_after_62] );
			balance.push( -paydownbalance );
		}
	}

	//////////////////////////////////
	// Create table-header first
	let thead = the_table.createTHead();
	let hrow1 = thead.insertRow();

	//////////////////////////
	// The header is 3 rows
	let cell = hrow1.insertCell(); // column 1
	cell.outerHTML = "<th rowspan=\"3\"></th>";

	if (arrears == 0) { // payment not in arrears - i.e. with payement and due dates the same.
		cell = hrow1.insertCell(); // column 2
		cell.outerHTML = "<th rowspan=\"3\">Date<br><small>(end of month)</small></th>";
	} else { // payment in arrears - i.e. payment is a month after due date.
		cell = hrow1.insertCell(); // column 2
		cell.outerHTML = "<th rowspan=\"3\">Benefit Due Date</th>";
		cell = hrow1.insertCell(); // column 3
		cell.outerHTML = "<th rowspan=\"3\">Benefit Payment Date</th>";
	}

	cell = hrow1.insertCell(); // column 3 (if not arrears, otherwise column 4
	cell.outerHTML = "<th rowspan=\"3\">Age (years:months)</th>";

	if (cola_percent != 0) {
		let th = document.createElement("th");
		th.innerHTML = "COLA factor";
		th.title = "Cost of Living Adjustment to compensate for inflation. A multiplicative factor. " +
			"Updated annually by the SSA and applied every December (reflected in the January payment)." +
			" This table uses an annual COLA of " + cola_percent +"%.";
		th.rowSpan = 3
	hrow1.appendChild(th);
	}

	if (spendit != 0) {
		let th = document.createElement("th");
		th.innerHTML = "Spending ($)";
		th.title = "Monthly deduction from the Bank Balance" + ((claiming_age_array_cleaned.length > 1) ? "(s)" : "") +
			" of $" + spendit +
			". If Bank Balance is negative, then interest is charged at an annual rate of " + borrow_irate + "%.";
		th.rowSpan = 3
		hrow1.appendChild(th);
	}


	let num_data_columns = claiming_age_array_cleaned.length * 3;
	let num_irates = interest_percent_array.length;
	th = document.createElement("th");
	th.colSpan = num_data_columns * num_irates;
	th.innerHTML = "Claiming-Age (year:month) Benefit Calculations";

	hrow1.appendChild(th);


	if (claiming_age_array_cleaned.length > 1) {
		let th = document.createElement("th");
		th.innerHTML = "Best Claiming-Age";
		th.title = "For each row, identifies the Claiming-Age with highest Bank Balance.";
		th.rowSpan = "3";
		hrow1.appendChild(th);
	}


	// Header Row 2
	let hrow2 = thead.insertRow();
	let odd_column_group = false;
	let col_label = [];
	let col_claiming_age = [];
	for (claiming_age of claiming_age_array_cleaned) {
		for (irate of interest_percent_array) {
			odd_column_group = ! odd_column_group;
			let th = document.createElement("th");
			let this_column_label = clagess_to_years_months(claiming_age,2) + ( (num_irates >= 2) ? (" @ " + irate + "%") : "");
			th.innerHTML = this_column_label;
			col_label.push( this_column_label );
			col_claiming_age.push( claiming_age );
			th.title = "Claiming-Age: " + clagess_to_years_months( claiming_age );
			th.colSpan = "3";
			th.classList.add(odd_column_group ? "odd_column_group" : "even_column_group");
			hrow2.appendChild(th);
		}
	}

	// Header Row 3
	let hrow3 = thead.insertRow();

	odd_column_group = false;
	for (claiming_age of claiming_age_array_cleaned) {
		for (irate of interest_percent_array) {
			odd_column_group = ! odd_column_group;
			let th = document.createElement("th");
			th.innerHTML = "Interest on Balance ($)";
			if (0) { // DVO HELP
			th.title = (paydownbalance == 0)
				?  ("Monthly interest earned on the previous Bank Balance. Annual interest rate is "+interest_percent+"%.")
				:  ("Monthly interest - initially amount charged on the loan (negative) Bank Balance at " + borrow_irate +
					"%, and then after the load is paid off, the interest earned on the positive Bank Balance at " + interest_percent + "%.")
				;
			} else {
				th.title = "DVO HELP";
			}
			th.classList.add(odd_column_group ? "odd_column_group" : "even_column_group");
			hrow3.appendChild(th);

			th = document.createElement("th");
			th.innerHTML = "Benefit payment from SSA ($)";
			th.title = "Payment from the Social Security Administration (i.e. the monthly benefit). Doesn't start until Claiming-Age ("+clagess_to_years_months(claiming_age,2)+", adjusted for COLA ("+cola_percent+"%) every January.";
			th.classList.add(odd_column_group ? "odd_column_group" : "even_column_group");
			hrow3.appendChild(th);

			th = document.createElement("th");
			th.innerHTML = "Bank Balance ($)";
			th.title = "Theoritical bank account balance given indicated history of Social Security check deposts and at indicated interest rates and COLA";
			th.classList.add(odd_column_group ? "odd_column_group" : "even_column_group");
			hrow3.appendChild(th);
		}
	}


	///////////////////////////////////////////////////////
	// create table-body
	let datasets = []; // for plotting - list of datasets where each dataset represents a single plot-line for each claiming-age -
				// containing the actual (Y values) data in an array named data.
	let labels = []; // for plotting - X axis labels


	let num_months = (max_age - 62) * 12 + arrears;
	let starting_months_after_62 = (paydownbalance > 0) ? -1 : 0;

	let accumulated_cola_percent = 0;
	let cola_factor = 1;

	let tbody = the_table.createTBody();
	let row_index = 0;
	for (let months_after_62 = starting_months_after_62; months_after_62 <= num_months; months_after_62++) { // each row
		let body_row = tbody.insertRow(-1);
		let header_cell = body_row.insertCell();
		header_cell.outerHTML = "<th>"+(months_after_62+1)+"</th>";

		header_cell = body_row.insertCell();
		header_cell.outerHTML = "<th>"+format_date(birth_year+62, birth_month_user-1+months_after_62)+"</th>";
		
		labels.push( format_date(birth_year+62, birth_month_user-1+months_after_62 ) +  " " + clagess_to_years_months(62+months_after_62/12, 2) );

		if (arrears) {
			header_cell = body_row.insertCell();
			header_cell.outerHTML = "<th>"+format_date(birth_year+62, birth_month_user-1+months_after_62+1)+"</th>";
		}

		header_cell = body_row.insertCell();
		//header_cell.outerHTML = "<th>"+ String(Math.floor(62 + (birth_month_user-1+months_after_62)/12)) + ":"+ months_after_62%12 + "</th>";
		header_cell.outerHTML = "<th>"+ clagess_to_years_months( 62 + months_after_62/12, 2) + "</th>";

		if ( ((birth_month_user-1+months_after_62)%12) == 11) { cola_factor *= 1+cola_percent/100; } // COLA increase is in Dec benefit (typically paid in Jan)

		if (cola_percent != 0.0) {
			header_cell = body_row.insertCell();
			//if (months_after_62 >= 0) { header_cell.outerHTML = "<th>" + parseFloat(cola_factor).toFixed(3) + "</th>"; }
			header_cell.outerHTML = "<th>" + ((months_after_62 >= 0) ? parseFloat(cola_factor).toFixed(3) : "") + "</th>";
		}

		if (spendit != 0) {
			spendit_cell = body_row.insertCell();
			spendit_cell.outerHTML = "<th>" + spendit + "</th>";
		}

		let best_balance = 0;
		let best_balance_col_index = 0;
		odd_column_group = false;
		let col_index = 0;
		for (claiming_age of claiming_age_array_cleaned) { // column groups
			for (irate of interest_percent_array) {
				let interest_per_month = (irate/100) / 12;
				if (row_index == 0) {
					datasets.push( { label: clagess_to_years_months( claiming_age, 3 ) + ((num_irates > 1) ? " @ " + String(irate) + "%" : ""),
							fill: false,
//						stepped: true,
//						borderWidth: 0.1,
//						borderDash: [5, 5],
//						borderDashOffset: 0,
							data: []
							} );
				}

				odd_column_group = ! odd_column_group;
				let this_interest = (balance[col_index] >= 0) ?  (balance[col_index] * interest_per_month) : (balance[col_index] * borrow_irate/100 / 12)
				let cell = body_row.insertCell();
				cell.classList.add(odd_column_group ? "odd_column_group" : "even_column_group");
				if (months_after_62 >= 0) {
					cell.innerHTML = parseFloat( this_interest ).toFixed(2);
					if (put_negative_values_in_parenthesis && (this_interest < 0) ) { cell.innerHTML = "(" + cell.innerHTML + ")"; }
					if (this_interest < 0) { cell.classList.add( "negative_dollars" ); }
					if (this_interest ==  0) { cell.classList.add("zero_dollars"); }
				}

				cell = body_row.insertCell();
				cell.classList.add(odd_column_group ? "odd_column_group" : "even_column_group");
				let new_balance = balance[col_index];
				if ((months_after_62 >= 0) && (months_after_62 < num_months)) {
					let benefit_obj = benefit[col_index];
					let month_benefit_starts = (benefit_obj.age_year-62)*12 + benefit_obj.age_month;
					let this_benefit = 0;
					if ((months_after_62 >= (month_benefit_starts + arrears)) && (months_after_62 <= ((max_age-62)*12) ) ) {
						//this_benefit = benefit_obj.benefit * pia * (1 + accumulated_cola_percent/100);
						this_benefit = benefit_obj.benefit * pia * cola_factor;
					}
					cell.innerHTML = parseFloat( this_benefit ).toFixed(2);
					if (this_benefit ==  0) { cell.classList.add("zero_dollars"); }

					new_balance += this_benefit + this_interest - spendit;
				}

				cell = body_row.insertCell();
				cell.classList.add(odd_column_group ? "odd_column_group" : "even_column_group");
				cell.innerHTML = parseFloat( new_balance ).toFixed(2);
				if (put_negative_values_in_parenthesis && (new_balance < 0) ) { cell.innerHTML = "(" + cell.innerHTML + ")"; }
				if (new_balance < 0) { cell.classList.add( "negative_dollars" ); }
				if (new_balance ==  0) { cell.classList.add("zero_dollars"); }
				balance[col_index] = new_balance;

				if (months_after_62 >= 0) {
					if (new_balance > best_balance) {
						best_balance = new_balance;
						best_balance_col_index = col_index;
					}
				}

				datasets[col_index].data.push( parseFloat(balance[col_index]).toFixed(2) );
				col_index++;
			} // for irate
		} // for ii < claiming_age_array_cleaned.length - column groups

		if (claiming_age_array_cleaned.length > 1) {
			cell = body_row.insertCell();
			cell.innerHTML = col_label[ best_balance_col_index ];
			cell.style.backgroundColor = clagess_color_interpolate( (col_claiming_age[ best_balance_col_index ] -62) * 12 / 96 );
		}
		row_index++;
	} // for months_after_62


	// Row for notes...
	let notes_row = tbody.insertRow(-1);
	let notes_cell = notes_row.insertCell();
	notes_cell.classList.add( "notes" );
	let number_of_columns = 4 + claiming_age_array_cleaned.length * num_irates * 3 + ((claiming_age_array_cleaned.length > 1) ? 1 : 0);
	notes_cell.setAttribute("colspan", number_of_columns);
	let the_HTML = "<b>Notes</b>:<ol>";
	the_HTML += "<li>The Social Security Administration pays benefits the month after (e.g. the June benefit is paid in July).";
	if (! arrears) { the_HTML += " However, the table is simplified, showing benefit payment in the month earned."; }
	the_HTML += "</li>"
	the_HTML += "<li>Benefits are <i>NOT</i> paid for the month of death.</li>";
	the_HTML += "<li>COLA adjustments are made for the December benefit which is paid in January.</li>";
	the_HTML += "<li>Benefits are paid on various days of the month depending on the claimant's birthday. Thus that could affect "
				+ "the amount of interest paid by a bank. This detail is not accounted for in the calculations.</li>";
	the_HTML += "</ol>";
	notes_cell.innerHTML = the_HTML;



	let interest_rate_string = (num_irates == 1) ? (interest_percent_array[0] + "%") : ("various interest rates (" + Math.min(...interest_percent_array) + "% .. " + Math.max(...interest_percent_array) + "%)");
	//if (append0_or_replace1 == 0) { my_parent.appendChild(table); }
	table_caption = the_table.createCaption();
	table_caption.innerHTML = title + ( (title!=='') ? '<br>' : "") +
				"Accumulating bank balance approach (aka Future Value) for evaluating Claiming-Age for Social Security benefits. " +
				"Simulates depositing every monthly Social Security benefit payment into a bank account paying <b>"+
				interest_rate_string+"</b> annually. " +
				"COLA is <b>" + cola_percent + "%</b>" +
				((cola_percent == 0) ? "" : " increases benefit amount every December (for the January benefit payment)") +
				". This table is for claimant born in <b>" + months_user[birth_month_user]+ " " + birth_year +
				"</b> and with a lifetime earnings resulting in a PIA of <b>$"+pia+"</b> in <b>"+ String(birth_year + 62)+ "</b>" +
				" and continues to age <b>" + max_age + "</b>." ;
	if (spendit > 0) {
		table_caption.innerHTML += "<br>Claimant is spending $" + spendit + " every month. Negative Bank Balances (if any) pay interest of <b>" + borrow_irate + "%</b>.";
	}
	if (paydownbalance > 0) {
		table_caption.innerHTML += "<br>Note: This starts with a loan pay-down situation - the initial loan balance is <b>$" + paydownbalance +
				"</b> at an annual interest rate of <b>" + borrow_irate +
				"%</b>. This interest rate is continued until the loan balance is paid off, at which time the annual " +
				"interest rate changes to <b>" + interest_rate_string + "%</b>.";
	}

	if (the_canvas !== null) { // plot
		//let ctx = document.createElement("canvas");
		//ctx.id = "myChart";
		//my_parent.appendChild(ctx);


		const delay_between_points = (animation_speed * 10) / (datasets[0].data.length+1); // +1 to avoid possible divide by 0
		const delay_between_datasets = (animation_speed > 0) ? 4000 : 0;
		my_animation = {
			x: { // Attempt to draw one dataset at a time.
				duration: 1000,
				from: NaN,
				delay(the_canvas) {
					if (the_canvas.type !== 'data') { return 0; }
						return the_canvas.datasetIndex * delay_between_datasets + the_canvas.index * delay_between_points;
				},
			}
		}


		let title_string_array = ["Claiming-Age's affect on Social Security Retirement Benefits Future Value"];
		if (title !== '') {
			title_string_array.splice(0, 0, title );
		}
		my_config = {
			type: "line",
			data: { labels: labels, datasets: datasets },
			options: {
				plugins: {
					title: {
						display: true,
						text: title_string_array
					},
					subtitle: {
						display: true,
						text: "Born: " + String(months_user[birth_month_user]) + " " + String(birth_year) +
							", Investment Interest Rate: " + interest_rate_string + ", COLA: "+ String(cola_percent) + "%, PIA: $" + String(pia) +
							(spendit ? (", spending $" + spendit + " per month") : "") +
							(paydownbalance ? (", initial loan balance of $" + paydownbalance) : "") +
							(borrow_irate ? (", paying interest at " + borrow_irate +"% annually on negative balances") : "")
					},
					tooltip: {
						callbacks: {
							label: function(context) {
								if (context.parsed.y !== null) {
									let dollars = new Intl.NumberFormat("en-US", {
										style:"currency",
										maximumFractionDigits:0,
										currency:"USD"
									}).format(context.parsed.y);
									return "Claiming age=" + context.dataset.label + ", Future Value=" + dollars;
								}
								return undefined;
							}
						}
					}
				},
				scales : {
					y: {
						ticks: {
							callback: value => new Intl.NumberFormat("en-US", {style:"currency",
								currency:"USD",
								maximumFractionDigits:0
							}).format(value)
						}
					}
				},
				animation: my_animation,
				onClick: (e) => {
					if (my_chart != null) {
						my_chart.destroy();
						my_chart = new Chart( the_canvas.getContext("2d"), my_config );
					}
				}
			}
		}

		my_chart = new Chart(the_canvas.getContext("2d"), my_config );
	}

	return the_table;
}




function clagess_generate_actuarial_table(  table_element, canvas_element, title, age_at_death )
{
//	let my_parent = document.getElementById(parent_id);
//	if (my_parent == null) { console.log("ERROR: no element found with id=", parent_id); return null; }

	let datasets = []; // for plotting - list of datasets where each dataset represents a single plot-line for each claiming-age -
				// containing the actual (Y values) data in an array named data.
	let survival_from_62_male = [];
	let survival_from_62_female = [];
	let labels = []; // for Y axis

	const age_62 = ss_period_life_table_2020[62];
	// 1st index is age in years.
	// 2nd index : 0=age, 1=Male Death Probability (that year), 2=Male Number of lives, 3=Male Life expectance, 4,5,6 repeat 1-3 for Female
	console.log("age_62=", age_62);
	console.log("The title=", title);
	for (let age=62; age <= age_at_death; age++) {
		const male_survival_percentage = 100* ss_period_life_table_2020[age][2] / ss_period_life_table_2020[62][2];
		const female_survival_percentage = 100* ss_period_life_table_2020[age][2+3] / ss_period_life_table_2020[62][2+3];
//		console.log("	At age ", age, ", Males: ", male_survival_percentage, "%, Females: ", female_survival_percentage );
		labels.push( age );
		survival_from_62_male.push( male_survival_percentage );
		survival_from_62_female.push( female_survival_percentage );
	}
//	console.log("male=", survival_from_62_male );
//	console.log("female=", survival_from_62_female );
//	console.log("labels=", labels );

	
//	let ctx = document.createElement("canvas");
//	ctx.id = "myChart";
//	my_parent.appendChild(ctx);
	datasets.push( { label: "Male", fill: false, borderWidth: 0.5, borderDash: [5, 8], data: survival_from_62_male } );
	datasets.push( { label: "Female", fill: false, borderWidth: 0.5, borderDash: [5, 8], data: survival_from_62_female } );

	if (1) { // plot
//		let ctx = document.createElement("canvas");
//		canvas_element.id = "myChart";
//		my_parent.appendChild(ctx);
		my_config = {
			type: "line",
			data: { labels: labels, datasets: datasets },
			options: {
				plugins: {
					title: {
						display: true,
						text: [title, "Survival rate after age 62"]
					},
					subtitle: {
						display: true,
						text: "Based on the Social Security Administration's 2020 data",
					},
//					tooltip: {
//						callbacks: {
//							label: function(context) {
//								if (context.parsed.y !== null) {
//									let dollars = new Intl.NumberFormat("en-US", {
//										style:"currency",
//										maximumFractionDigits:1,
//										currency:"USD"
//									}).format(context.parsed.y);
//									return "Monthly retirement benefit=" + dollars;
//								}
//								return undefined;
//							}
//						}
//					},
				},
				scales : {
					y: {
						ticks: {
//							format: { style: 'percent' },
							// Hmmm... I haven't found any way of formatting so both the Y axis, and hover-text are both correct.
							callback: function(value) { return value.toFixed(0) + '%'; }
						},
						title: {
							text: "Survival Rate",
							display: true,
						}
					},
					x: {
						title: {
							text: "Age (years)",
							display: true,
						}
					}
				},
				//animation: my_animation,
//				onClick: (e) => {
//					if (my_chart != null) {
//						my_chart.destroy();
//						my_chart = new Chart( ctx.getContext("2d"), my_config );
//					}
//				}
			}
		}
		my_chart = new Chart(canvas_element.getContext("2d"), my_config );
	}
}


function elements_list_alter_classes(elements_list, classes_to_remove=null, classes_to_add=null)
{
	for (element of elements_list) {
		if (classes_to_remove != null) {
			for (to_remove of classes_to_remove) {
				element.classList.remove( to_remove );
			}
		}
		if (classes_to_add != null) {
			for (to_add of classes_to_add) {
				element.classList.add( to_add );
			}
		}
	}
}

function elements_list_enable( elements_list, enable ) // if enable=0 then disable
{
	for (element of elements_list) {
		element.disabled = enable ? false : true;
	}
}

function form1_onchange_birthdate(parent_id=0)
{
	let messages_id = "clagess_input_form_messages";
	let my_parent = document.getElementById(parent_id);

	let the_element = document.getElementById(messages_id);
	if (the_element == null) { console.log("ERROR - what to do??? messages_id (", messages_id,") in function form1_onchange_birthdate(), returns null"); }

	let birth_year = document.getElementById( "form1_birthyear_id" );
	let birth_month = document.getElementById( "form1_birthmonth_id" );

	if ( (Number(birth_year.value) >= 1900) && (Number(birth_year.value) < 2100) ) {
		let full_retirement_age = clagess_full_retirement_age(Number(birth_year.value));
		the_element.innerHTML = "Full retirement age: " + clagess_to_years_months( full_retirement_age, 1 );
	} else {
		the_element.innerHTML = ""; // erase anything already written
	}
}


function claiming_ages_string_to_values( claiming_age_string )
{
	let claiming_age_values = claiming_age_string.replace(/\s+/g, ' '). split(' ').map(string_ycm_to_num);
	// Look for special cases - a space as first and/or last element
	if (claiming_age_values[0] == ' ') { claiming_age_values.shift(); }
	if (claiming_age_values[claiming_age_values.length-1] == ' ') { claiming_age_values.pop(); }

	return claiming_age_values;
}

function form1_onchange_claiming_ages(claiming_age_id)
{
	console.log("ENTER form1_onchange_claiming_ages(", claiming_age_id, ")");
	let claiming_ages = document.getElementById(claiming_age_id);
	if (claiming_ages == null) { console.log("ERROR - what to do??? claiming_age_id (", claiming_age_id,") in function form1_onchange_claiming_ages(), returns null"); }

	let  claiming_age_values = claiming_ages_string_to_values( claiming_ages.value );
	console.log("    claiming_ages.value=", claiming_ages.value );
	console.log("    claiming_age_values=", claiming_age_values );

	if ((claiming_age_values.length == 3) && (claiming_age_values[0] < claiming_age_values[1]) &&  (claiming_age_values[2] < claiming_age_values[1]) ) {
		let start = claiming_age_values[0];
		let stop = claiming_age_values[1];
		let increment = claiming_age_values[2];
		let new_list = [];
		let new_string1 = ""
		let new_string2 = ""
		for (let the_value = claiming_age_values[0]; the_value <= claiming_age_values[1]; the_value += claiming_age_values[2] ) {
			new_list.push( the_value );
			new_string1 += string_ycm_to_num( String(the_value) ) + " ";
			new_string2 += clagess_to_years_months( the_value, 3 )    + " ";
		}
		claiming_ages.value = new_string2;
		console.log("    new string=", claiming_ages.value );
	}

}

function form1_onchange_report(parent_id=0)
{
	console.log("In form1_onchange_report(parent_id=", parent_id, ")");
}



////////////////////////////////////////////////////////////////////////////////////////////////////////////

function walkit( content, indent="" )
{
	console.log(indent, "Enter walkit: content=", content );
	if (content instanceof Array ) {
		console.log(indent + "  ", "Array of length: ", content.length );
		for (let ii=0; ii<content.length; ii++) {
			console.log(indent + "  ", "Index ", ii );
			walkit( content[ii], indent + "    " );
		}
	} else
	if (typeof content === "string") {
		console.log(indent + "  ", "string: ", content );
	} else
	if (typeof content === "number") {
		console.log(indent + "  ", "number: ", content );
	} else
	if (typeof content === "boolean") {
		console.log(indent + "  ", "boolean: ", content );
	} else
	if (typeof content === "object") {
		console.log(indent + "  ", "object: ", content );
	} else
	if (typeof content === "function") {
		console.log(indent + "  ", "function: ", content );
	} else
	{
		console.log(indent + "  ", "Else: ", typeof content );
	}
}

function zz3( element_list )
{
	let first_element = null;
	let latest_element = null;

	for (let ii=0; ii<element_list.length; ii+=2) {
		const the_keyword = element_list[ii];
		const the_value = element_list[ii+1];
		console.log("   element_list[", ii, "]: keyword=", the_keyword, ", value=", the_value );
		if (the_keyword === "element") {
			console.log("  Calling document.createElement(", the_value, ")");
			latest_element = document.createElement(the_value);
			if (latest_element == null) {
				console.error("ERROR: in zz3: document.createElement(", the_value, ") return null");
				return;
			}
			if (first_element === null) {
				first_element = latest_element;
			} else {
				first_element.appendChild(latest_element);
			}
		} else if (the_keyword === "innerHTML") {
			latest_element.innerHTML = the_value;
		} else {
			console.log(" Calling setAttribute(", the_keyword, ", ", the_value , ")");
			latest_element.setAttribute( the_keyword, the_value );
		}
	}
	return first_element;
}

function form_engine_row( row_content, table_body )
{
	console.log("Enter form_engine_row: row_content=", row_content );

	if ( !(row_content instanceof Array) ) {
		console.error("ERROR: expecting an argument of type ARRAY in function form_engine_row - found: ", typeof(row_content) );
		return;
	}

	let table_row = table_body.insertRow(-1);

	for (let col_i = 0; col_i < row_content.length; col_i++) {
		console.log("row_content[", col_i, "]=", row_content[col_i] );
		console.log("row_content[", col_i, "][0]=", row_content[col_i][0] );

		let the_element = document.createElement(row_content[col_i][0]);

		if (row_content[col_i][1] instanceof Array) {
			for (let attribute_i = 0; attribute_i < row_content[col_i][1].length; attribute_i+=2) {
				const attr  = row_content[col_i][1][attribute_i];
				const value = row_content[col_i][1][attribute_i+1];

				console.log("    Col ", row_content[col_i][0], ": Attr: ", attr, ", Value: ", value);
				if (attr === 'innerHTML') {
					the_element.innerHTML = value;
				} else {
					the_element.setAttribute( attr, value );
				}
			}
		}

		if (row_content[col_i][2] instanceof Array) {
			let new_element = zz3( row_content[col_i][2] );
			the_element.appendChild(new_element);
		}

		table_row.insertCell(-1).appendChild(the_element);
		console.log("    Col: ", row_content[col_i][0] );
	}
}

function form_engine( form_content, table_body )
{
	console.log("Enter form_engine: form_content=", form_content);
	if ( !(form_content instanceof Array) ) {
		console.error("ERROR: expecting an argument of type ARRAY in function form_engine - found: ", typeof(form_content) );
		return;
	}

	for (let row_i = 0; row_i < form_content.length; row_i++) { // Each element in form_content represents one row in the table
		form_engine_row( form_content[row_i], table_body );
	}
}


function clagess_create_input_form( parent_id )
{
	let my_parent = document.getElementById(parent_id);
	if (my_parent == null) { console.log("ERROR: no element found with id=", parent_id); return null; }

	let table1 = document.createElement("table");
	table1.classList.add("clagess_control_form");
	my_parent.appendChild(table1);

	let table1_body = table1.createTBody();
	let form1 = document.createElement("form");
	form1.name="SS_Form";

	if (the_form_reports === null) {
		the_form_reports = new ClagessFormReports( parent_id );
	}
	the_form_reports.RenderTable( table1_body, form1 );

	let report_1 = new Report_BankBalanceTable( the_form_reports );
	let report_2 = new Report_ClaimingAgeTable( the_form_reports );
	let report_3 = new Report_OptimumRetirementClaimingAgeSummaryChart( the_form_reports );
	let report_4 = new Report_ActuaryTable( the_form_reports );

	let report_9 = new Report_Licensing( the_form_reports );


	my_parent.appendChild(form1);
	the_form_reports.on_change(parent_id);

	the_form_reports.onchange_options(parent_id);

	return form1;
}

function clagess_licensing( parent_id )
{
	let my_parent = document.getElementById(parent_id);
	if (my_parent == null) { console.error("ERROR: no element found with id="+ parent_id+ " in clagess_licensing" ); return null; }

	let table_list = my_parent.querySelectorAll("table");
	table = table_list[ table_list.length-1];
	if ( typeof table !== "undefined" ) {
		while (table.hasChildNodes()) {
			table.removeChild(table.lastChild);
		}
	}

	let my_div = document.createElement("div");
	my_div.id = "mit_license";

	my_div.innerHTML =
		"<p>Copyright (c) 2023-2024 Don Organ" +
		"<p>Copyright (c) 2014-2022 Chart.js Contributors" +

		"<p>Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the \"Software\"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:" +

		"<p>The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software." + 

		"<p>THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.";

	my_parent.appendChild(my_div);
}

