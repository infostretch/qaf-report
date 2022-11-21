/*******************************************************************************
 * MIT License
 * 
 * Copyright (c) 2019 Infostretch Corporation
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:

 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 * 
 * For any inquiry or need additional information, please contact
 * support-qaf@infostretch.com
 ******************************************************************************/

function getUrlVar(key) {

	var result = new RegExp(key + "=([^&]*)", "i").exec(window.location.search);

	return (result && unescape(result[1] + "/test-results")) || "test-results";

}

function getIdFromDir(dir) {
	var index = dir.indexOf("test-results") + "test-results/".lenght;
	var endindex = dir.indexOf("json") - 1;

	return dir.substring(index, endindex);
}



function getStepTimes(checkpoints) {
	var d = [];
	$.each(checkpoints, function(index, value) {
		var threshold = 0;
		if (value.threshold) {
			threshold = value.threshold;
		}
		d.push([ index, value.duration / 1000.0, threshold ]);
	});
	return JSON.stringify(d);
}


// JS format string

String.prototype.format = function () {
  // store arguments in an array
  var args = arguments;
  // use replace to iterate over the string
  // select the match and check if the related argument is present
  // if yes, replace the match with the argument
  return this.replace(/{([0-9]+)}/g, function (match, index) {
    // check if the argument is present
    return typeof args[index] == 'undefined' ? match : args[index];
  });
};
function formatMetaData(key,value) {
	try{
		var formatStr = metadata_formats[key]||"{0}";
		return formatStr.format(value);
	}catch(e){
		console.log(e);
		return value;
	}
}

function displayMetaData(key,value) {
	if (isString(value))
		return "<span class='group'>" + formatMetaData(key,value) + "</span>";
	var blkstr = [];
	$.each(value, function(idx, val) {
		var str = "<span class='group'>" + formatMetaData(key,val) + "</span>";
		blkstr.push(str);
	});
	return blkstr.valueOf();

}

function toggleTab(ele, contentCss) {
	if (($(ele).hasClass("ui-state-active"))) {
		return 0;
	}

	container = $(ele).parent().parent();
	$(container).find('.tab-content:not(' + contentCss + ')').each(function() {
		var tab = $(this);
		tab.slideUp();
	});
	$(container).find('.action').each(function() {
		$(this).removeClass('ui-state-active');
		$(this).removeClass('ui-state-highlight');

	});
	$(container).find(".tab-content" + contentCss).show();
	$(container).find(".tab-content" + contentCss).slideDown();
	$(container).find('.action' + contentCss).each(function() {
		$(this).addClass('ui-state-active');
	});
}

function getIcon(type) {
	type = type.toLowerCase();

	if (type == 'pass')
		return 'ui-icon-circle-check';
	if (type == 'fail')
		return 'ui-icon-circle-close';
	if (type == 'skip')
		return 'ui-icon-cancel';
	if (type == 'warn')
		return 'ui-icon-notice';
	if (type == 'teststep')
		return 'ui-icon-pencil';
	if (type == 'teststeppass')
		return 'ui-icon-check';
	if (type == 'teststepfail')
		return 'ui-icon-closethick';

	return 'ui-icon-' + type;
}

function getHeaderIcon(type) {
	type = type.toLowerCase();

	if (type == 'pass')
		return 'ui-icon-check';
	if (type == 'fail')
		return 'ui-icon-closethick';
	if (type == 'skip')
		return 'ui-icon-cancel';

	return 'ui-icon-' + type;
}

function getHeaderState(type) {
	type = type.toLowerCase();

	if (type == 'pass')
		return 'ui-state-pass';
	if (type == 'fail')
		return 'ui-state-error';
	if (type == 'skip')
		return 'ui-state-alert';

	return '';
}

function getContainerClass(type) {
	type = type.toLowerCase();
	if (type == 'pass')
		return 'pass ui-state-pass';
	if (type == 'fail' || type == 'teststepfail')
		return type + ' ui-state-error';
	if (type == 'info' || type == 'teststep')
		return type + ' ui-state-highlight';
	if (type == 'teststeppass')
		return type + ' ui-state-pass';
	if (type == 'warn')
		return type + ' ui-state-warn';
	return ' ui-state-highlight';

}
function trunck(str) {
	if (str.toString().length > 100) {
		return '<span title="' + str + '">' + str.toString().substring(0, 30)
				+ '...</span>';
	}
	return str;
}

function escapHtml(str){
	if(str){
		return str.replace(/<(?!(a |\/a))/gi,"&lt;");
	}
	return "";
}

function formatedRes(res) {
	if(!res) return "";
	res = vkbeautify.xmlmin(res, true);

	try {
		var results = [];
		extractJSON(res, results);
		$(results).each(function(index, value) {
			res = res.replace(value, vkbeautify.json(value));
		});
	} catch (e) {
		console.log(e);
	}
	res = vkbeautify.xml(res);

	return res;
}

function extractJSON(str, results) {
	var firstOpen, firstClose, candidate;
	firstOpen = str.indexOf('{', firstOpen + 1);
	do {
		firstClose = str.lastIndexOf('}');
		// console.log('firstOpen: ' + firstOpen, 'firstClose: ' + firstClose);
		if (firstClose <= firstOpen) {
			return results;
		}
		do {
			candidate = str.substring(firstOpen, firstClose + 1);
			// console.log('candidate: ' + candidate);
			try {
				var res = JSON.parse(candidate);
				// console.log('...found');
				results.push(candidate);
				// return [res, firstOpen, firstClose + 1];
				return extractJSON(str.slice(firstClose + 1), results)
			} catch (e) {
				// console.log('...failed');
			}
			firstClose = str.substr(0, firstClose).lastIndexOf('}');
		} while (firstClose > firstOpen);
		firstOpen = str.indexOf('{', firstOpen + 1);
	} while (firstOpen != -1);
}

function showDialog(ele) {
	cmdDialog = $("#cmd-dialog");
	$('#request-details').html($(ele).find("td:nth(1)").html());
	$('#response-details').html($(ele).find("td:nth(2)").html());

	$(cmdDialog).dialog(
			{
				modal : true,
				resizable : true,
				draggable : true,
				width : '80%',
				height : '630',
				title : "Details",
				buttons : {
					'Close' : function() {
						$(this).dialog('close');
					},
					'Request' : function() {
						$('#request-details').show();
						$(cmdDialog).scrollTop("0");
					},
					'Response' : function() {
						$('#response-details').show();
						var top = $('#request-details').is(":visible") ? $(
								'#request-details').height() : "0";
						$(cmdDialog).scrollTop(top);
					}
				}
			});
}
function previewImage(uri) {

	// Get the HTML Elements
	imageDialog = $("#dialog");
	imageTag = $('#image');
	newWin = $('#newwin');

	// Split the URI so we can get the file name
	uriParts = uri.split("/");

	// append dir if not absolute path
	if (uri.indexOf('http') != 0 && uri.indexOf('\.') == 0)
		uri = curResultDir + "/" + uri;

	// Set the image src
	imageTag.attr('src', uri);
	newWin.attr('href', uri);

	// When the image has loaded, display the dialog
	imageTag.load(function() {

		$('#dialog').dialog({
			modal : true,
			resizable : true,
			draggable : true,
			width : '450px',
			title : uriParts[uriParts.length - 1]
		});
	});

}



function isChecked(objCss) {
	return $(objCss).is(":checked");
}

function setChecked(objCss, bval) {
	return $(objCss).prop('checked', bval);
}



function displayTotalTime(container, data) {

	var dur = getTotalDuration(data.checkPoints);
	if (dur > 0) {
		$(container).find("#totalTime").show();
		$(container).find("#totalTime").find('td').text((dur) + 's');
	}

}

function getTotalDuration(entries) {
	var dur = 0;
	$.each(entries, function(index, value) {
		if (value.duration)
			dur = dur + value.duration;
	});

	return dur > 0 ? dur / 1000.0 : 0;
}



function setActiveTab(tab) {
	$("ul.tabs li").removeClass("active");
	$(tab).addClass("active");
	$(".tab_content").hide();
}



function removePkgName(cls) {
	return cls.indexOf('.') > 0 ? cls.substr(cls.lastIndexOf('.') + 1) : cls;
}
var i = 100;

function dspTCLink(obj) {
	var ele = $(obj[1]).find('.mehodheader .ui-icon-text');
	var nId = 'f' + (i++);
	$(ele).attr("id", nId);
	return "<li><a onclick='viewTest(\"" + nId
			+ "\")' href='javascript:void(0);'>" + $(ele).text() + "</a></li>";
}

function getTestName(obj, nid) {
	$(obj).find('.mehodheader .ui-icon-text').id = nid;
	return $(obj).find('.mehodheader .ui-icon-text').text();
}





function toggle(ele, childCss) {
	$(ele).children(childCss).toggle('slow');
}



function wait(forTask, timeout) {
	setTimeout(forTask, timeout);
}


jQuery.expr[':'].Contains = function(a, i, m) {

	var pattern = new RegExp(m[3], "ig");
	return pattern.test(jQuery(a).text());
};

// utility functions

function parseArray(obj) {
	/*
	 * var blkstr = []; for (var i = 0, l = obj.length; i < l; i++) {
	 * blkstr.push(jsonToString(obj[i])); }
	 */return JSON.stringify(obj, null, ' ');
}


function jsonToString(value) {
	if (isString(value))
		return value;
	var blkstr = [];
	$.each(value, function(idx2, val2) {
		var str = idx2 + ":" + jsonToString(val2);
		blkstr.push(str);
	});
	return blkstr.valueOf();
}

isString = function(o) {
	return o == null || typeof o == "string"
			|| (typeof o == "object" && o.constructor === String);
}

function isMap(o) {
    try {
        Map.prototype.has.call(o); // throws if o is not an object or has no [[MapData]]
        return true;
    } catch(e) {
        return false;
    }
}

function msToDateStr(ms) {
	var date = new Date(ms);
	return date;
}

function msToFormatedDateStr(ms) {
	var date = new Date(ms);
	return date.toLocaleDateString() + " " + date.toLocaleTimeString();// .customFormat(
}

function getDuration(ms) {
	if (ms < 0)
		return "N/A";
	secs = ms / 1000;
	var hours = Math.floor(secs / (60 * 60));
	var divisor_for_minutes = secs % (60 * 60);
	var minutes = Math.floor(divisor_for_minutes / 60);
	var divisor_for_seconds = divisor_for_minutes % 60;
	var seconds = Math.ceil(divisor_for_seconds);
	return hours + ":" + minutes + ":" + seconds;
}

function calcPassRate(pass, fail, skip) {
	return Math.round(pass / (pass + fail + skip) * 100);
}

String.prototype.capitalizeFirstLetter = function() {
	return this.charAt(0).toUpperCase() + this.slice(1);
};

/** * */
(function($) {
	var AjaxQueue = function(options) {
		this.options = options || {};
		var oldComplete = options.complete || function() {
		};
		var completeCallback = function(XMLHttpRequest, textStatus) {
			(function() {
				oldComplete(XMLHttpRequest, textStatus);
				if ($.ajaxQueue.getRequestCount() <= 0) {
					$.ajaxQueue.done();
					$.ajaxQueue.done = function() {
					};
				}
			})();
			$.ajaxQueue.currentRequest = null;
			$.ajaxQueue.startNextRequest();

		};
		this.options.complete = completeCallback;
	};

	AjaxQueue.prototype = {
		options : {},
		perform : function() {
			$.ajax(this.options);
		}
	}

	$.ajaxQueue = {
		queue : [],

		currentRequest : null,
		inprogrss : false,
		stopped : false,
		done : function() {
		},
		getRequestCount : function() {
			return $.ajaxQueue.queue.length;
		},
		stop : function() {
			$.ajaxQueue.stopped = true;

		},

		run : function() {
			$.ajaxQueue.stopped = false;
			$.ajaxQueue.startNextRequest();
		},

		clear : function() {
			$.ajaxQueue.stopped = false;
			var requests = $.ajaxQueue.queue.length;
			for (var i = 0; i < requests; i++) {
				$.ajaxQueue.queue.shift();
			}
			$.ajaxQueue.currentRequest = null;
		},

		addRequest : function(options) {
			var request = new AjaxQueue(options);
			$.ajaxQueue.queue.push(request);
			$.ajaxQueue.startNextRequest();
		},

		startNextRequest : function() {
			if ($.ajaxQueue.currentRequest) {
				return false;
			}
			var request = $.ajaxQueue.queue.shift();
			if (request && !$.ajaxQueue.stopped) {
				inprogrss = true;
				$.ajaxQueue.currentRequest = request;
				request.perform();
			} else {
				inprogrss = false;
			}
		}
	}

})(jQuery);
