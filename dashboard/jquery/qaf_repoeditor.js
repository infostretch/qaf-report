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
 *
 * @author Chirag Jayswal
 ******************************************************************************/

var pageLayout;
var stpesList;
var checkpointTemplate = '<pre class="prettyprint" style="border: none !important; margin-bottom:0">'
	+ '<div class="checkpoint ${getContainerClass(type)}" style="border:none;">'
	+ '<div {{if subCheckPoints}}onclick="$(this).closest(\'.checkpoint\').children(\'.subcheckpoints\').toggle();$(this).children(\'span\').toggleClass(\'ui-icon-triangle-1-e ui-icon-triangle-1-s\');" {{/if}}>'
	+ '<span class="ui-icon {{if subCheckPoints.length > 0}} ui-icon-triangle-1-e {{else}} ${getIcon(type)} {{/if}}" style="float:left;margin-top:0.0em;margin-left:5px;" title="${type}"></span>'
	+ '<span style="vertical-align:top;margin-left:25px;display:block;word-wrap: break-word;">{{html escapHtml(message)}}'
	+ '{{if screenshot}}<a class="screenshot" href="${screenshot}" target="_blank" style="width:auto;margin-top:0.0em;vertical-align:middle;" title="Screenshot">📷</a>'
	+ '{{/if}}'
	+ '{{if duration}}'
	+ '[{{if threshold}}'
	+ '{{if (threshold>0) && (threshold*1000<duration)}}<span class="step-threshold" style="color:#FF9900" title="threshold: ${threshold}s&#13;exceeded: ${duration/1000.0 - threshold}s">${duration/1000.0}s</span>{{else}}'
	+ '<span class="step-threshold" title="threshold: ${threshold}s&#13;outstanding: ${threshold - duration/1000.0}s">${duration/1000.0}s</span> {{/if}} {{else}}${duration/1000.0}s {{/if}}] {{/if}}'
	+ '</span>'
	+ '</div>'
	+ '{{if subCheckPoints}}'
	+ '<div style="display:none;" class="subcheckpoints">'
	+ '{{tmpl(subCheckPoints) "checkpointTemplate"}}'
	+ '</div>'
	+ '{{/if}}' + '</div>' + '</pre>';

var commandLogTemplate =
	'<div class="command-log" style="display:block;margin-left: 30px;font-size:small; color:gray" {{if subLogs.length > 0}}onclick="$(this).children(\'.command-log\').toggle();$(this).children(\'span.ui-icon\').toggleClass(\'ui-icon-triangle-1-e ui-icon-triangle-1-s\');"{{/if}}>'
	+ '{{if subLogs.length > 0}}<span class="ui-icon ui-icon-triangle-1-s" style="float:left;margin-top:0.0em;margin-left:5px;"></span>{{/if}}'
	+ '<b>${commandName}</b> : ${args} : <span style="color:gray;">${result}</span>'
	+ '{{if subLogs}}{{tmpl(subLogs) "commandLogTemplate"}}{{/if}}'
	+ '</div>';

$.template("checkpointTemplate", checkpointTemplate);
$.template("commandLogTemplate", commandLogTemplate);
var grpcMethodDetailsTemplate = '<div class="ui-layout-south">'
	+ '<div id="response"></div>'
	+ '</div><div class="ui-layout-east"><div id="wsc-view"><pre></pre></div></div>'
	+ '<div class="ui-layout-center content"><div id="wsc-editor">'
	+ '<table class="wscTable">'
	+ '<tr><td>Server: </td><td>'
	+ '<input name="baseurl" title="grpc server" value="${baseurl}"/>'
	+ '	<button id="executeGrpc" onclick="executeGrpc()" class="ui-button ui-widget ui-corner-all" title="Execute"> <span class="ui-icon ui-icon-play"></span></button>'
	+ '</td></tr>'
	+ '<tr><td width="50">'
	+ 'Endpoint:</td><td>'
	+ '<input name="endpoint" value="${endpoint}" style="border:0" />'
	+ '</td></tr></table>'
	//tabs
	+ '<div id="wsc-tabs"><ul>'
	+ '<li><a href="#tabs-4">Body</a></li>'
	+ '<li><a href="#tabs-6">Run Params</a></li></ul>'

	+ '<div  id="tabs-4"><textarea cols="50" rows="5" name="body" title="request body" >${body}</textarea></div>'
	+ getKVTmpl('Run Params', 'runparameters', 6)

	//end tabs
	+ '</div>'

	// layout
	+ '</div></div>';
var checkpointsInputTemplate = '<tr><td><input type="text" value="${checkpoint}" style="width:450px;"/><a title="Remove" class="ui-icon ui-icon-minus" onclick="removeEntry(this)"></a></td></tr>';

var wscFormTemplate = '<div class="ui-layout-south">'
	+ '<div id="response"></div>'
	+ '</div><div class="ui-layout-east"><div id="wsc-view"><pre></pre></div></div>'
	+ '<div class="ui-layout-center content"><div id="wsc-editor">'
	+ '<table class="wscTable">'
	+ '<tr><td>Reference: </td><td>'
	+ '<input style="border:0" name="reference" placeholder="None" title="request reference" value="${reference}"  onchange="updateWSCView()"/>'
	+ '<div id="req-call-actions">'
	+ '	<button id="reset" class="ui-button ui-widget ui-corner-all  ui-icon-arrowreturnthick-1-w ui-icon" title="Reset"> </button>'
	+ '	<button id="save" class="ui-button ui-widget ui-corner-all ui-icon  ui-icon-arrowthickstop-1-n" title="Save"> </button>'
	+ '</div>'
	+ '</td></tr>'
	+ '<tr><td width="50">'
	+ '<input type="text" name="method" value="${method}" placeholder="GET" size="8" onchange="updateWSCView()"/></td><td>'
	+ '<input type="text" name="baseurl" value="${baseurl}" placeholder="base url" size="15" onchange="updateWSCView()"/>'
	+ '<input type="text" name="endpoint" value="${endpoint}" placeholder="end point" onchange="updateWSCView()"/>'
	+ '	<button id="execute" onclick="execute()" class="ui-button ui-widget ui-corner-all" title="Execute"> <span class="ui-icon ui-icon-play"></span></button>'
	+ '</td></tr></table>'
	//tabs
	+ '<div id="wsc-tabs"><ul>'
	+ '<li><a href="#tabs-1">Headers</a></li>'
	+ '<li><a href="#tabs-2">Query Params</a></li>'
	+ '<li><a href="#tabs-3">Form Params</a></li>'
	+ '<li><a href="#tabs-4">Body</a></li>'
	+ '<li><a href="#tabs-5">Default values</a></li>'
	+ '<li><a href="#tabs-6">Run Params</a></li>'
	+ '<li><a href="#tabs-7">Checkpoints</a></li></ul>'

	+ getKVTmpl('Headers', 'headers', 1)
	+ getKVTmpl('Query Params', 'query-parameters', 2)
	+ getKVTmpl('Form Params', 'form-parameters', 3)
	+ '<div  id="tabs-4"><textarea cols="50" rows="5" name="body" title="request body" onchange="updateWSCView()">${body}</textarea></div>'
	+ getKVTmpl('Default values', 'parameters', 5)
	+ getKVTmpl('Run Params', 'run-parameters', 6)
	+ '<div  id="tabs-7">'
	+ '<table id="tblcheckpoints"><tbody>'
	+ '{{if (typeof $data["post-steps"] != \'undefined\') }}'
	+ '{{each(i,checkpoint) $data["post-steps"]}}'
	+ checkpointsInputTemplate
	+ '{{/each}}'
	+ '{{/if}}'
	+ '</tbody> <tfoot><tr><td><a title="Add" class="ui-icon ui-icon-plus" onclick="addCheckpoint()"></a></td></tr></tfoot>'
	+ '</table></div>'
	//end tabs
	+ '</div>'

	// layout
	+ '</div></div>';
var kvTemplate = '{{each(k,v) $data}} <tr>'
	+ '<td><input type="text" name="${k}" value="${k}" class="key" onchange="updateWSCView()"/></td>'
	+ '<td><input type="text" name="${k}-value" value="${v}" class="value" onchange="updateWSCView()"/><a title="Remove" class="ui-icon ui-icon-minus" onclick="removeEntry(this)"></a></td>'
	+ '</tr>{{/each}}';

function getKVTmpl(name, objName, i) {
	return '<div id="tabs-' + i + '"><table id="tbl' + toId(objName) + '"><tbody>'
		+ '{{if (typeof $data["' + objName + '"] != \'undefined\') }} {{each(i,v) $data["' + objName + '"]}} {{if (v && v!= \'undefined\' && v.length>0)}}'
		+ '<tr>'
		+ '<td><input type="text" name="${i}" value="${i}" class="key" onchange="updateWSCView()"/></td>'
		+ '<td><input type="text" name="${i}-value" value="${v}" class="value" onchange="updateWSCView()"/><a title="Remove" class="ui-icon ui-icon-minus" onclick="removeEntry(this)"></a></td>'
		+ '</tr>'
		+ '{{/if}} {{/each}} {{/if}}'
		+ '</tbody> <tfoot><tr><td></td><td><a title="Add" class="ui-icon ui-icon-plus" onclick="addEntry(\'tbl' + toId(objName) + '\')"></a></td></tr></tfoot>'
		+ '</table></div>'
}

function toggleFields(e) {
	$(e).toggleClass("collapse  expanded");
}

$(document).ready(function() {
	// create page layout
	pageLayout = $('body').layout({

		north: {
			//size : 50,
			spacing_open: 0,
			closable: false,
			resizable: false
		},
		south: {
			size: 150,
			spacing_closed: 22,
			closable: true,
			resizable: true,
			togglerAlign_closed: "left",
			togglerLength_closed: 140,
			togglerContent_closed: "Console",
			initClosed: true
		},
		west: {
			size: 250,
			spacing_closed: 22,
			togglerLength_closed: 140,
			togglerAlign_closed: "center",
			togglerContent_closed: "R<BR>e<BR>p<BR>o<BR>s",
			togglerTip_closed: "Browse Repositories",
			sliderTip: "Slide Open Repositories",
			slideTrigger_open: "mouseover"
		}
	});
	tree = $('#tree')
		.jstree({
			'core': {
				'data': {
					'url': '/repo-editor?operation=get_node',
					'data': function(node) {
						return { 'id': node.id };
					}
				},
				'check_callback': function(o, n, p, i, m) {
					if (m && m.dnd && m.pos !== 'i') { return false; }
					/*if (o === "move_node" || o === "copy_node") {
						if (this.get_node(n).parent === this.get_node(p).id) { return false; }
					}*/
					return true;
				},
				'themes': {
					'responsive': false,
					'variant': 'small',
					'stripes': true
				}
			},
			'sort': function(a, b) {
				return this.get_type(a) === this.get_type(b) ? (this.get_text(a) > this.get_text(b) ? 1 : -1) : (this.get_type(a) >= this.get_type(b) ? 1 : -1);
			},
			'contextmenu': {
				'items': function(node) {
					var tmp = $.jstree.defaults.contextmenu.items();
					if (this.get_type(node) === "folder") {
						tmp.refresh = {
							"label": "Refresh",
							"action":function(data){var inst = $.jstree.reference(data.reference);inst.refresh_node(node);}
						};
						tmp.load = {
							"label": "Load",
							"action": function(data) {
								console.log(data);
								var inst = $.jstree.reference(data.reference),
									obj = inst.get_node(data.reference);
								$.get('/repo-editor?operation=load_resource', { 'path': inst.get_path(node, "/") });
							}
						};
						tmp.import = {
							"label": "Import",
							"submenu": {
								"ImportOpenApi": {
									"label": "Import Open API Spec",
									"action": function(data) {
										var inst = $.jstree.reference(data.reference);
										var file = prompt("Please enter file", "");
										if(null!= file){
											executeBddSteps(["importOpenAPISpec"], [file,inst.get_path(node, "/")]);
											inst.refresh_node(node);
										}
									}
								},
								"ImportPostmanCollection": {
									"label": "Import Postman Collection",
									"action": function(data) {
										var inst = $.jstree.reference(data.reference);
										var file = prompt("Please enter file", "");
										if(null!= file){
											executeBddSteps(["importPostmanColletion"], [file,inst.get_path(node, "/")]);
											inst.refresh_node(node);
										}
									}
								}
							}
						};
					} else {
						tmp.duplicate = {
							"label": "Duplicate",
							"action": function(data) {
								console.log(data);
								var inst = $.jstree.reference(data.reference),
									obj = inst.get_node(data.reference);
								$.get('/repo-editor?operation=duplicate_node', { 'path': obj.id }).done(function() {
									inst.refresh_node(obj.parent);
								});
							}
						};
					}
					if (this.get_type(node) === "node-grpc") {
						return null;
					}
					delete tmp.create.action;
					if (node.text.endsWith('.wsc') || node.text.endsWith('.wscj')) {
						tmp.create.label = "New Request Call";

						tmp.create.action = function(data) {
							var inst = $.jstree.reference(data.reference),
								obj = inst.get_node(data.reference);
							inst.create_node(obj, { type: "node" }, "last", function(new_node) {
								setTimeout(function() { inst.edit(new_node) }, 0);
							});
						}
					} else if (this.get_type(node) === "folder") {
						tmp.create.label = "New";
						tmp.create.submenu = {
							"create_folder": {
								"separator_after": true,
								"label": "Folder",
								"action": function(data) {
									var inst = $.jstree.reference(data.reference),
										obj = inst.get_node(data.reference);
									var created = inst.create_node(obj, { type: "folder", text: "new folder" }, "last");
									if (!created) {
										var domobj = inst.get_node(obj, true);
										console.log(domobj);
										var cnt = $(domobj).children('ul').children().length + 1;
										inst.create_node(obj, { type: "folder", text: "new folder" + cnt }, "last");
									}
								}
							},
							"create_WSC_repo": {
								"label": "WSC Repo",
								"action": function(data) {
									var inst = $.jstree.reference(data.reference),
										obj = inst.get_node(data.reference);
									inst.get_node()
									var created = inst.create_node(obj, { type: "file-wsc", text: "newrepo.wscj" }, "last");
									console.log(created);
									if (!created) {
										inst.create_node(obj, { type: "file-wsc", text: "newrepo" + $.now() + ".wscj" }, "last");
									}
								}
							},
							"create_loc_repo": {
								"label": "Locator Repo",
								"action": function(data) {
									var inst = $.jstree.reference(data.reference),
										obj = inst.get_node(data.reference);
									inst.get_node()
									var created = inst.create_node(obj, { type: "file-loc", text: "newrepo.locj" }, "last");
									console.log(created);
									if (!created) {
										inst.create_node(obj, { type: "file-loc", text: "newrepo" + $.now() + ".locj" }, "last");
									}
								}
							}
						};
					}
					if (this.get_type(node) === "file" || this.get_type(node) === "node" || this.get_type(node) === "file-proto") {
						delete tmp.create;
					}
					return tmp;
				}
			},
			'types': {
				'default': { 'icon': 'file' },
				'folder': { 'icon': 'folder' },
				'file-wsc': { 'icon': 'file-wsc' },
				'file-wscj': { 'icon': 'file-wsc' },
				'file-loc': { 'icon': 'file-loc' },
				'file-locj': { 'icon': 'file-loc' },
				'file-proto': { 'icon': 'file-proto' },
				'file': { 'valid_children': [], 'icon': 'file' },
				'node': { 'valid_children': [], 'icon': 'node' },
				'node-grpc': { 'valid_children': [], 'icon': 'node' }
			},
			'unique': {
				'duplicate': function(name, counter) {
					console.log(name + counter);
					if (name.endsWith(".wsc") || name.endsWith(".loc") || name.endsWith(".wscj") || name.endsWith(".locj")) {
						var l = name.length;
						var ext = name.substring(l - 4);
						return name.substring(0, l - 4) + counter + ext;
					}
					return name + ' ' + counter;
				}
			},
			'plugins': ['state', 'dnd', 'sort', 'types', 'contextmenu', 'unique']
		})
		.on('delete_node.jstree', function(e, data) {
			$.get('/repo-editor?operation=delete_node', { 'id': data.node.id })
				.fail(function() {
					data.instance.refresh();
				});
		})
		.on('create_node.jstree', function(e, data) {
			$.get('?operation=create_node', { 'type': data.node.type, 'id': data.node.parent, 'text': data.node.text })
				.done(function(d) {
					data.instance.set_id(data.node, d.id);
					data.instance.set_text(data.node, d.text);
					setTimeout(function() {
						data.instance.edit(data.node)
					}, 0);
				})
				.fail(function() {
					console.log(e);
					data.instance.refresh();
				});
			/*if(data.node.parent.endsWith(".wsc")){
				$.get('?operation=create_node', { 'type' : data.node.type, 'id' : data.node.parent, 'text' : data.node.text })
				.done(function (d) {
					data.instance.set_id(data.node, d.id);
					data.instance.set_text(data.node, d.text);
					setTimeout(function () { 
						data.instance.edit(data.node)},0);
				})
				.fail(function () {
					data.instance.refresh();
				});
			}else{
				if(data.node.type=="file-wsc" && !(data.node.text.endsWith(".wsc"))){
					data.instance.set_text(data.node, data.node.text +".wsc");
				}
				data.instance.set_id(data.node, data.node.parent +"/"+data.node.text);
			}
			setTimeout(function () { 
				data.instance.edit(data.node)},0);
				*/
			//});
			/* 
			$.get('?operation=create_node', { 'type' : data.node.type, 'id' : data.node.parent, 'text' : data.node.text })
				.done(function (d) {
					data.instance.set_id(data.node, d.id);
				})
				.fail(function () {
					data.instance.refresh();
				}); */
		})
		.on('rename_node.jstree', function(e, data) {
			//if(data.text!==data.old){
			$.get('/repo-editor?operation=rename_node', { 'id': data.node.id, 'text': data.text, 'old': data.old })
				.done(function(d) {
					data.instance.set_id(data.node, d.id);
				})
				.fail(function(e) {
					console.log(e);
					data.instance.refresh();
				});
			//}
		})
		.on('move_node.jstree', function(e, data) {
			$.get('/repo-editor?operation=move_node', {
				'name': data.node.text,
				'parent': data.instance.get_path(data.parent, "/"),
				'oldParent': data.instance.get_path(data.old_parent, "/"),
			})
				.done(function(d) {
					//data.instance.load_node(data.parent);
					data.instance.refresh();
				})
				.fail(function() {
					data.instance.refresh();
				});
		})
		.on('copy_node.jstree', function(e, data) {
			$.get('/repo-editor?operation=copy_node', { 'id': data.original.id, 'parent': data.parent })
				.done(function(d) {
					//data.instance.load_node(data.parent);
					data.instance.refresh();
				})
				.fail(function() {
					data.instance.refresh();
				});
		})
		.on('changed.jstree', function(e, data) {
			if (data && data.selected && data.selected.length == 1) {
				var node = data.instance.get_node(data.selected[0]);
				//var path = node.id.split('#',2);
				if (node.id.indexOf('#') > 0) {
					var path = data.instance.get_path(node.parent, "/");
					if (path.endsWith(".proto")) {
						$.get('/repo-editor?operation=get_grpc_content', { 'path': path, 'name': node.text }).done(function(d) {
							createGrpcReqForm(d, node, path);
						});
					} else {
						$.get('/repo-editor?operation=get_wsc_content', { 'path': path, 'name': node.text }).done(function(d) {
							if (d['method'] === 'GRPC') {
								createGrpcReqForm(d, node, path);
							} else {
								createReqForm(d, node, path);
							}
						});
					}

				} else if (node.text.endsWith(".loc") || node.text.endsWith(".locj")) {
					var path = data.instance.get_path(node, "/");
					$.get('/repo-editor?operation=get_content', { 'path': path }).done(function(d) {
						createRepoEditor(d, path);
					});
				} else {
					resetContentPane();
					var type = data.instance.get_type(node);
					console.log(type);
					if (data.instance.get_type(node) === "default") {
						var path = data.instance.get_path(node, "/");
						var btns = '<button id="save" onclick="saveFile(\'' + path + '\');" disabled="true">Save</button>';
						if (path.endsWith(".properties")) {
							btns = btns + ' <button id="loadFile" onclick="loadFile(\'' + path + '\');" >Load</button>';
						}
						var html = btns + '<br/><textarea cols="100" id="file-editor" onchange="$(\'#save\').removeAttr(\'disabled\')"></textarea>';
						$('#editor').html(html);
						$.ajax({ url: path, dataType: "text" }).done(function(content) {
							$("#file-editor").val(content);
							$("#file-editor").height('auto').height($("#file-editor").prop('scrollHeight') + 'px');
						});
					}
				}
			}
			else {
				resetContentPane();
			}
		});
	(function(i, s, o, g, r, a, m) {
		i['GoogleAnalyticsObject'] = r; i[r] = i[r] || function() {
			(i[r].q = i[r].q || []).push(arguments)
		}, i[r].l = 1 * new Date(); a = s.createElement(o),
			m = s.getElementsByTagName(o)[0]; a.async = 1; a.src = g; m.parentNode.insertBefore(a, m)
	})(window, document, 'script', 'https://www.google-analytics.com/analytics.js', 'ga');

	ga('create', 'UA-83031490-1', 'auto');
	ga('require', 'linkid');
	ga('send', 'pageview');
	$.get('/repo-editor?operation=step_list')
		.done(function(res) {
			stpesList = res;
			$("#bddstep").autocomplete({ source: (stpesList), position: { collision: "flip" } });
		});
	if (!Array.prototype.last) {
		Array.prototype.last = function() {
			return this[this.length - 1];
		};
	};
});
function clearConsole() {
	$('#clear-console').animate({ opacity: 0.4 }, 0);
	$('#console #logs').html('');
	$('#clear-console').animate({ 'opacity': 0.8 }, 500);
}
function loadFile(path) {
	$.ajax("/repo-editor?operation=load_resource&path=" + path);
}

function saveFile(path) {
	$('#save').attr('disabled', 'disabled');
	var content = $("#file-editor").val();
	console.log(content);
	//save_file
	$.ajax({
		type: "POST",
		url: "/repo-editor?operation=save_file&path=" + path,
		data: content,
		contentType: "text/plain; charset=utf-8",
		success: function() {
			log('Saved file: ' + path);
		},
		failure: function(errMsg) {
			log('Error:: ' + errMsg);
		}
	});
}

//tab functions
function loadTab(tab_id) { //tab_id - contains some id, title and text for tab content.
	//var tab_id = thisI;
	if (!$('.ui-tabs-nav li#' + tab_id).is('*')) {
		//Add tab function
		$("#tabs ul").append(
			'<li id="' + tab_id + '"><a href="#tab"' + tab_id + '">' + tab_id + '</a><i class="close-tab" onclick="closeTab(\'' + tab_id + '\')">X</i></li>');
		$("div#tabs").append(
			'<div id="' + tab_id + '"></div>');
		//$("div#tabs").tabs("refresh");
		$("#tabs").tabs("refresh");

	} else {
		var TAB_index = $('.ui-tabs-nav li#' + tab_id).index();
		$("#tabs").tabs({
			active: TAB_index
		}); //Will activate already exist tab
	}
}

//Close tab
function closeTab(tab_id) {
	$('.ui-tabs-nav li#' + tab_id).remove();
	$('#tabs div#' + tab_id).remove();
	$("#tabs").tabs("refresh");
}

layoutSettings_Inner = {
	applyDefaultStyles: true // basic styling for testing & demo purposes

	, south: {
		size: 150,
		spacing_closed: 22,
		closable: true,
		resizable: true,
		togglerAlign_closed: "left",
		togglerAlign_open: "center",
		togglerLength_closed: 140,
		togglerContent_closed: "Response",
		slideTrigger_open: "mouseover",
		initClosed: true
	},
	east: {
		size: 450,
		spacing_closed: 22,
		togglerLength_closed: 140,
		togglerAlign_closed: "center",
		togglerContent_closed: "R<BR>e<BR>p<BR>o<BR>s",
		togglerTip_closed: "Browse Repositories",
		sliderTip: "Slide Open Repositories",
		slideTrigger_open: "mouseover"
	}
}

function createGrpcReqForm(data, node, path) {
	console.log(data);
	resetContentPane();
	//grpcMethodDetailsTemplate
	try {
		$.tmpl(grpcMethodDetailsTemplate, data).appendTo("#editor");
		window['innerLayout'] = $("#editor").layout(layoutSettings_Inner);
		$('#wsc-tabs').tabs();
		$('#editor button').each(function() { $(this).button(); });
		$("#wsc-view pre").text(JSON.stringify(data.input, null, '  ').replaceAll('\\n', '\n'));

	} catch (e) {

	}
}
var methodSugessions = ["GET", "PUT", "POST", "PATCH", "DELETE", "HEAD", "OPTIONS"];
var contentTypes = ["text/plain", "text/json", "text/css", "text/csv", "text/html", "text/xml",
	"application/vnd.android.package-archive", "application/vnd.oasis.opendocument.text",
	"application/vnd.oasis.opendocument.spreadsheet", "application/vnd.oasis.opendocument.presentation",
	"application/vnd.oasis.opendocument.graphics", "application/vnd.ms-excel",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	"application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
	"application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	"application/vnd.mozilla.xul+xml",
	"multipart/mixed", "multipart/alternative", "multipart/form-data",
	"application/java-archive", "application/EDI-X12", "application/EDIFACT",
	"application/javascript", "application/octet-stream", "application/ogg", "application/pdf", "application/xhtml+xml",
	"application/x-shockwave-flash", "application/json",
	"application/ld+json", "application/xml", "application/zip",
	"application/x-www-form-urlencoded"
]
var headerSugessions = {
	"Accept": contentTypes, "Accept-Charset": ["utf-8"], "Accept-Encoding": ["gzip", "deflate", "compress", "identity", "br", "*"], "Accept-Datetime": [], "Accept-Language": [], "Access-Control-Request-Method": [], "Access-Control-Request-Headers": [],
	"Authorization": ["Basic <credentials>", "Bearer <token>"], "Cache-Control": ["no-cache"], "Connection": ["keep-alive", "Upgrade"], "Content-Encoding": ["gzip"],
	"Content-Type": contentTypes,
	"Content-MD5": [],
	"X-API-Key": []
}
function setAutocomplete(keyInput, valInput) {
	//console.log(Object.keys(headerSugessions));
	//console.log($(keyInput));

	$(keyInput).autocomplete({
		source: Object.keys(headerSugessions)
	});
	$(valInput).autocomplete({
		source: function(request, response) {
			//response(headerSugessions[$(keyInput).val()]);

			var matcher = new RegExp($.ui.autocomplete.escapeRegex(request.term), "i");
			response($.grep(headerSugessions[$(keyInput).val()], function(item) {
				return matcher.test(item);
			}));
		}
	});
}

function toLowerCaseKey(obj) {
	//const entries = Object.entries(obj);
	return Object.fromEntries(
		Object.entries(obj).map(([key, value]) => {
			return [key.toLowerCase(), value];
		}),
	);
}

//form functions
function createReqForm(data, node, path) {
	resetContentPane();

	try {

		$.tmpl(wscFormTemplate, toLowerCaseKey(data)).appendTo("#editor");
		if (node) {
			$('#save').removeAttr('disabled');
			$("#save").click(function() { saveReqForm(node, path); });
			$("#reset").click(function() { createReqForm(data, node, path); });

		} else {
			$("#save").attr('disabled', 'disabled');;
		}
		//http://layout.jquery-dev.net/tips.html
		//$.extend( layoutSettings_Inner, layoutState.load(window['innerLayout']));
		window['innerLayout'] = $("#editor").layout(layoutSettings_Inner);
		$('#wsc-tabs').tabs();
		$('#editor button').each(function() { $(this).button(); });
		$( "input[name=method]" ).autocomplete({ source: methodSugessions });
		$('table#tblheaders > tbody  > tr').each(function(index, tr) {
			var keyVal = $(tr).find('input');
			setAutocomplete(keyVal[0], keyVal[1]);
		});
		$("table#tblcheckpoints input").each(function() { $(this).autocomplete({ source: (stpesList), position: { collision: "flip" } }); });
		loadWSCView(data);

	} catch (e) {
		console.log(e);
	}
}

function loadWSCView(data) {
	var stepcall = {
		step: 'resolveWSCwithData',
		args: [JSON.stringify(data), data['run-parameters'] || {}]
	}
	$.ajax({
		type: "POST",
		url: "/executeStep",
		data: JSON.stringify(stepcall),
		contentType: "application/json; charset=utf-8",
		//dataType : "json",
		success: function(res) {
			if (res.result) {
				result = JSON.parse(res.result);
				console.log(res.result);
				$("#wsc-view pre").text(JSON.stringify(result, null, '   '));
			} else {
				log('Unexpected response: ' + JSON.stringify(res));
				$("#wsc-view pre").text(JSON.stringify(data, null, '  '));
			}
		},
		failure: function(errMsg) {
			log('Error:: ' + errMsg);
			$("#wsc-view pre").text(JSON.stringify(data, null, '  '));
		}
	});
}
function executeStep() {
	var bddstep = $('input#bddstep').val().trim();
	executeBddSteps([bddstep]);
}
function executeBddSteps(bddstep,vargs) {
	//var bddstep = $('input#bddstep').val().trim();
	var ignore = $("input#bddstep").is(":disabled") || bddstep.length <= 0;
	if (!ignore) {
		$("input#bddstep").prop("disabled", true);
		$("#executeStepBtn").toggleClass('ajax-loading');
		log('Executing Step:: ' + bddstep);
		var stepcall = {
			step: bddstep.shift(),
			args: vargs||[]
		}
		ajaxMaskUI({
			maskUI: true,
			type: "POST",
			url: "/executeStep",
			async: false,
			data: JSON.stringify(stepcall),
			contentType: "application/json; charset=utf-8",
			//dataType : "json",
			success: function(res) {
				try {
					if (res.result) {
						log('result:: ' + JSON.stringify(res.result, null, '  '));
						//log(res.result,true);
						if (res.checkPoints) {
							$.tmpl(checkpointTemplate, res.checkPoints).appendTo('#console #logs');
							//$("#logs div.checkpoint:last")[0]
							$.tmpl(commandLogTemplate, res.seleniumLog[0].subLogs).appendTo('#console #logs div.checkpoint:last');
						}
					} else if (res.checkPoints) {
						$.tmpl(checkpointTemplate, res.checkPoints).appendTo('#console #logs');
						$.tmpl(commandLogTemplate, res.seleniumLog[0].subLogs).appendTo('#console #logs div.checkpoint:last');
					} else {
						if (res.error) {
							log('<span class="fail">[ERROR]: ' + res.error + "</span>", true);
						} else {
							log('response: ' + JSON.stringify(res));
						}
					}
					$("input#bddstep").prop("disabled", false);
					$("#executeStepBtn").toggleClass('ajax-loading');
					if (bddstep.length > 0) {
						executeBddSteps(bddstep);
					}
				} catch (e) {
					console.log(e);
				}
			},
			failure: function(errMsg) {
				log('Error:: ' + errMsg);
				$("input#bddstep").prop("disabled", false);
				$("#executeStepBtn").toggleClass('ajax-loading');
			}
		});
	}
}
function updateWSCView() {
	var data = getFormData();
	loadWSCView(data);
}
function resetContentPane() {
	try {
		//$("#inner").layout().destroy();
		var $C = $('#editor');
		//save state
		//layoutState.save(window['innerLayout']);
		if ($C.data("layoutContainer"))
			$C.layout().destroy();
		window['innerLayout'] = null;

	} catch (e) { }
	$('#editor').html('');
}
var locRepoEditorTmpl = '<div class="header">'
	+ '	<button id="save">Save</button>'
	+ '</div>'
	+ '<div id="loc-editor-container"> </div>';

function createRepoEditor(data, path) {
	resetContentPane();
	$.tmpl(locRepoEditorTmpl).appendTo("#editor");
	if (!data || data.length <= 0) {
		data = [{
			key: '', locator: '', desc: ''
		}];
	}

	$('#loc-editor-container').html(makeTable(data));
	$('.json_table').addClass('table table-bordered table-striped table-hover table-sm');
	$('.json_table thead').addClass('thead-dark');

	$("#save").click(function() {
		//log(JSON.stringify(makeJson()));

		$.ajax({
			type: "POST",
			url: "/repo-editor?operation=save_loc&path=" + path,
			data: JSON.stringify(makeJson()),
			contentType: "application/json; charset=utf-8",
			dataType: "json",
			success: function(data) {
				log(JSON.stringify(data));
			},
			failure: function(errMsg) {
				alert(errMsg);
			}
		});
	});
}

function saveReqForm(node, path) {
	node.data = getFormData();
	console.log("saving " + node.data + " in " + path);
	save(node.text, path, node.data)
}
//SAVE/UPDATE REQCALL (CERATE FILE/FOLDER ON SAVING/UPDATING REQCALL ONLY)
function save(nodename, path, data) {
	//var endpoint = "/"+path+"?name="+nodename;
	var endpoint = "/repo-editor?operation=save_wsc&path=" + path + "&name=" + nodename;

	$.ajax({
		type: "POST",
		url: endpoint,
		data: JSON.stringify(data),
		contentType: "application/json; charset=utf-8",
		dataType: "json",
		success: function(data) {
			log(JSON.stringify(data));
		},
		failure: function(errMsg) {
			alert(errMsg);
		}
	});
}

function getFormData() {
	var reqcall = {};
	add(reqcall, 'reference');
	add(reqcall, 'baseurl');
	add(reqcall, 'endpoint');
	add(reqcall, 'method');
	addEntries(reqcall, 'headers');
	addEntries(reqcall, 'query-parameters');
	addEntries(reqcall, 'form-parameters');
	add(reqcall, 'body');
	addEntries(reqcall, 'parameters');
	addEntries(reqcall, 'run-parameters');
	addCheckpoints(reqcall, 'post-steps');
	return reqcall;
}

function execute() {
	var reqcall = getFormData();
	$("#execute span").toggleClass('ajax-loading');
	ajaxMaskUI({
		maskUI: true,
		type: "POST",
		url: "/executeRequest",
		data: JSON.stringify([JSON.stringify(reqcall), JSON.stringify(reqcall['run-parameters']) || '{}']),
		contentType: "application/json; charset=utf-8",
		//dataType : "json",
		success: function(data, status, xhr) {
			//console.log(xhr);
			if (typeof data === 'object') {
				showResponse(data);
				log(data);
				window['innerLayout'].open('south');
			} else {
				log(data);
			}
			var postSteps = reqcall['post-steps'];
			if (postSteps && postSteps.length > 0) {
				//for(step of postSteps){
				executeBddSteps(postSteps);
				//}
			}
			$("#execute span").toggleClass('ajax-loading');
		},
		failure: function(errMsg) {
			log(errMsg);
			$("#execute span").toggleClass('ajax-loading');
		}
	});
}

function executeGrpc() {
	var reqcall = getFormData();
	var endpoint = reqcall['endpoint'];
	if (reqcall['baseurl']) {
		endpoint = reqcall['baseurl'] + '/' + endpoint;
	}
	console.log(reqcall);
	var stepcall = {
		step: 'callGrpcMethodUsingData',
		args: [endpoint, reqcall['body'], reqcall['run-parameters'] || {}]
	}
	$("#executeGrpc span").toggleClass('ajax-loading');
	ajaxMaskUI({
		maskUI: true,
		type: "POST",
		url: "/executeStep",
		data: JSON.stringify(stepcall),
		contentType: "application/json; charset=utf-8",
		//dataType : "json",
		success: function(data, status, xhr) {
			//console.log(xhr);
			if (typeof data === 'object' && data.result) {
				showResponse(data.result);
				log(data);
				window['innerLayout'].open('south');
			} else {
				log(data);
			}
			$("#executeGrpc span").toggleClass('ajax-loading');
		},
		failure: function(errMsg) {
			log(errMsg);
			$("#executeGrpc span").toggleClass('ajax-loading');
		}
	});
}
// same as $.ajax but settings can have a maskUI property
// if settings.maskUI==true, the UI will be blocked while ajax in progress
// if settings.maskUI is other than true, it's value will be used as the color value while bloking (i.e settings.maskUI='rgba(176,176,176,0.7)'
// in addition an hourglass is displayed while ajax in progress
function ajaxMaskUI(settings) {
	function maskPageOn(color) { // color can be ie. 'rgba(176,176,176,0.7)' or 'transparent'
		var div = $('#maskPageDiv');
		if (div.length === 0) {
			$(document.body).append('<div id="maskPageDiv" style="position:fixed;width:100%;height:100%;left:0;top:0;display:none"></div>'); // create it
			div = $('#maskPageDiv');
		}
		if (div.length !== 0) {
			div[0].style.zIndex = 2147483647;
			div[0].style.backgroundColor = color;
			div[0].style.display = 'inline';
		}
	}
	function maskPageOff() {
		var div = $('#maskPageDiv');
		if (div.length !== 0) {
			div[0].style.display = 'none';
			div[0].style.zIndex = 'auto';
		}
	}
	function hourglassOn() {
		if ($('style:contains("html.hourGlass")').length < 1) $('<style>').text('html.hourGlass, html.hourGlass * { cursor: wait !important; }').appendTo('head');
		$('html').addClass('hourGlass');
	}
	function hourglassOff() {
		$('html').removeClass('hourGlass');
	}

	if (settings.maskUI == true) settings.maskUI = 'transparent';

	if (!!settings.maskUI) {
		maskPageOn(settings.maskUI);
		hourglassOn();
	}

	var dfd = new $.Deferred();
	$.ajax(settings)
		.fail(function(jqXHR, textStatus, errorThrown) {
			if (!!settings.maskUI) {
				maskPageOff();
				hourglassOff();
			}
			dfd.reject(jqXHR, textStatus, errorThrown);
		}).done(function(data, textStatus, jqXHR) {
			if (!!settings.maskUI) {
				maskPageOff();
				hourglassOff();
			}
			dfd.resolve(data, textStatus, jqXHR);
		});

	return dfd.promise();
}
function log(message, isHtml) {
	if (typeof message === 'object')
		message = JSON.stringify(message);

	var console = $('#console #logs');
	if (!isHtml) {
		console.append('<div class="log-line">[' + new Date().toLocaleTimeString() + '] ' + formatedRes(message) + '</div>');
	} else {
		console.append('<div  class="log-line">[' + new Date().toLocaleTimeString() + '] ' + message + '</div>');
	}
	$("#logs div:last")[0].scrollIntoView();
}
function showResponse(data) {
	if ($("#response #tabs").length <= 0) {
		$('#response').html('<div id="tabs"><ul></ul></div>');
		$("#tabs ul").append('<li><a href="#tabs-0">Response</a></li>');
		$("#tabs ul").after("<div id='tabs-0'></div>");
		$("#tabs ul").append('<li><a href="#tabs-1">Headers</a></li>');
		$("#tabs ul").after("<div id='tabs-1'></div>");
		$("#tabs ul").append('<li><a href="#tabs-2">Body</a></li>');
		$("#tabs ul").after("<div id='tabs-2'></div>");
		$("#tabs").tabs({ event: "mouseover" });
	}

	var body = data["messageBody"] || data["body"];
	if (data["headers"]) {
		$("#tabs-1").html(Object.keys(data["headers"]).map(function(key) {
			return '<b>' + (key) + '</b>: ' +
				(data["headers"][key]);
		}).join('<br/>'));
	}

	var mediaType = data['mediaType'] || "";
	if (mediaType.indexOf('html') >= 0) {
		$("#tabs-2").html(data["messageBody"]);
	} else if (mediaType.indexOf('json') >= 0) {
		$("#tabs-2").html('<pre></pre>');
		$("#tabs-2 pre").text(data["messageBody"]);
		console.log(JSON.parse(body));

		//$("#tabs-2").html('<pre>'+JSON.stringify(data["messageBody"],null,'\t')+'</pre>');
	}
	else {
		$("#tabs-2").html('<pre></pre>');
		$("#tabs-2 pre").text(body);
	}
	delete data["headers"];
	delete data["messageBody"];
	delete data["body"];

	$("#tabs-0").html(Object.keys(data).map(function(key) {
		return '<b>' + (key) + '</b>: ' +
			(JSON.stringify(data[key], null, '\t'));
	}).join('<br/>'));

}
function add(m, f) {
	var val = $("[name=" + f + "]").val();
	if (val && val.trim().length > 0) {
		m[f] = val.trim();
	}
}
function addCheckpoints(m, f) {
	var checkpoints = [];
	$("#tblcheckpoints tr input").each(function() {
		var checkpoint = $(this).val().trim();
		if (checkpoint.length > 0) {
			checkpoints.push(checkpoint);
		}
	});
	m[f] = checkpoints;
}
function addEntries(m, f) {
	var entries = {};
	$("#tbl" + toId(f) + " tr").each(
		function() {
			if ($(this).find("input").length > 0) {
				var key = $(this).find("input").first().val().trim();
				if (key.length > 0) {
					entries[key] = $(this)
						.find("td:nth-child(2) input").val().trim();
				}
			}
		});
	if (Object.entries(entries).length > 0) {
		m[f] = entries;
	}
}

function addEntry(f) {
	$.tmpl(kvTemplate, { "": "" }).appendTo("#" + f);
	if (f === "tblheaders") {
		$('table#tblheaders > tbody  > tr:last').each(function(index, tr) {
			var keyVal = $(tr).find('input');
			setAutocomplete(keyVal[0], keyVal[1]);
		});
	}
}
function addCheckpoint() {
	$.tmpl(checkpointsInputTemplate).appendTo("#tblcheckpoints");
	$("table#tblcheckpoints input:last").autocomplete({ source: (stpesList), position: { collision: "flip" } });
}
function removeEntry(f) {
	$(f).parent().parent().remove();
	updateWSCView();
}
var testdata = {
	baseurl: "http://www.google.com",
	endpoint: "",
	//method:"GET",
	headers: {
		header1: "value1",
		header2: "value2"
	},
	queryParameters: {
		param1: "test",
		param2: "123"
	}
};

function toId(str) {
	return str.replace(/[^a-zA-Z]/g, "");
} 
