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
 	var grpcMethodDetailsTemplate = '<div class="ui-layout-south">'
									+'<div id="response"></div>'
								+'</div><div class="ui-layout-east"><div id="wsc-view"><pre></pre></div></div>'
			+'<div class="ui-layout-center content"><div id="wsc-editor">'
			+'<table class="wscTable">'
			+ '<tr><td>Server: </td><td>'
			+ '<input name="baseurl" title="grpc server" value="${baseurl}"/>'
			+'	<button id="show" onclick="executeGrpc()" class="ui-button ui-widget ui-corner-all" title="Execute"> <span class="ui-icon ui-icon-play"></span></button>'
			+ '</td></tr>'
			+'<tr><td width="50">'
			+ 'Endpoint:</td><td>'
			+ '<input name="endpoint" value="${endpoint}" style="border:0" />'
			+ '</td></tr></table>'
			//tabs
			+ '<div id="wsc-tabs"><ul>'
			+'<li><a href="#tabs-4">Body</a></li>'
			+'<li><a href="#tabs-6">Run Params</a></li></ul>'

			+ '<div  id="tabs-4"><textarea cols="50" rows="5" name="body" title="request body" >${body}</textarea></div>'
			+ getKVTmpl('Run Params', 'runparameters',6)

			//end tabs
			+ '</div>'
			
			// layout
			+'</div></div>';
	
		var methodDetailsTemplate = '<div class="ui-layout-south">'
									+'<div id="response"></div>'
								+'</div><div class="ui-layout-east"><div id="wsc-view"><pre></pre></div></div>'
			+'<div class="ui-layout-center content"><div id="wsc-editor">'
			+'<table class="wscTable">'
			+ '<tr><td>Reference: </td><td>'
			+ '<input style="border:0" name="reference" placeholder="None" title="request reference" value="${reference}"  onchange="updateWSCView()"/>'
			+'<div id="req-call-actions">'	
			+'	<button id="reset" class="ui-button ui-widget ui-corner-all  ui-icon-arrowreturnthick-1-w ui-icon" title="Reset"> </button>'
			+'	<button id="save" class="ui-button ui-widget ui-corner-all ui-icon  ui-icon-arrowthickstop-1-n" title="Save"> </button>'
			+'</div>'
			+ '</td></tr>'
			+'<tr><td width="50">'
			+ '<input type="text" name="method" value="${method}" placeholder="GET" size="8" onchange="updateWSCView()"/></td><td>'
			+ '<input type="text" name="baseurl" value="${baseurl}" placeholder="base url" size="15" onchange="updateWSCView()"/>'
			+ '<input type="text" name="endpoint" value="${endpoint}" placeholder="end point" onchange="updateWSCView()"/>'
			+'	<button id="show" onclick="execute()" class="ui-button ui-widget ui-corner-all" title="Execute"> <span class="ui-icon ui-icon-play"></span></button>'
			+ '</td></tr></table>'
			//tabs
			+ '<div id="wsc-tabs"><ul>'
			+'<li><a href="#tabs-1">Headers</a></li>'
			+'<li><a href="#tabs-2">Query Params</a></li>'
			+'<li><a href="#tabs-3">Form Params</a></li>'
			+'<li><a href="#tabs-4">Body</a></li>'
			+'<li><a href="#tabs-5">Default values</a></li>'
			+'<li><a href="#tabs-6">Run Params</a></li></ul>'

			+ getKVTmpl('Headers', 'headers',1)
			+ getKVTmpl('Query Params', 'query-parameters',2)
			+ getKVTmpl('Form Params', 'form-parameters',3)
			+ '<div  id="tabs-4"><textarea cols="50" rows="5" name="body" title="request body" onchange="updateWSCView()">${body}</textarea></div>'
			+ getKVTmpl('Default values', 'parameters',5)
			+ getKVTmpl('Run Params', 'run-parameters',6)

			//end tabs
			+ '</div>'
			
			// layout
			+'</div></div>';
	
	var kvTemplate ='{{each(k,v) $data}} <tr>'
		+ '<td><input type="text" name="${k}" value="${k}" class="key" onchange="updateWSCView()"/></td>'
		+ '<td><input type="text" name="${k}-value" value="${v}" class="value" onchange="updateWSCView()"/><a title="Remove" class="ui-icon ui-icon-minus" onclick="removeEntry(this)"></a></td>'
		+ '</tr>{{/each}}';
		
	function getKVTmpl(name, objName,i){
		return '<div id="tabs-'+i+'"><table id="tbl'+toId(objName)+'"><tbody>'
		+ '{{if (typeof $data["'+objName+'"] != \'undefined\') }} {{each(i,v) $data["'+objName+'"]}} {{if (v && v!= \'undefined\' && v.length>0)}}'
		+ '<tr>'
		+ '<td><input type="text" name="${i}" value="${i}" class="key" onchange="updateWSCView()"/></td>'
		+ '<td><input type="text" name="${i}-value" value="${v}" class="value" onchange="updateWSCView()"/><a title="Remove" class="ui-icon ui-icon-minus" onclick="removeEntry(this)"></a></td>'
		+ '</tr>'
		+ '{{/if}} {{/each}} {{/if}}'
		+ '</tbody> <tfoot><tr><td></td><td><a title="Add" class="ui-icon ui-icon-plus" onclick="addEntry(\'tbl'+toId(objName)+'\')"></a></td></tr></tfoot>'
		+ '</table></div>'
	}
		
	function toggleFields(e){
		$(e).toggleClass("collapse  expanded");
	}
	
	$(document).ready(function() {
		// create page layout
		pageLayout = $('body').layout({
			
			north : {
				//size : 50,
				spacing_open : 0,
				closable : false,
				resizable : false
			},
			south : {
				size : 150,
				spacing_closed : 22,
				closable : true,
				resizable : true,
				togglerAlign_closed : "left",
				togglerLength_closed : 140,
				togglerContent_closed : "Console",
				initClosed: true
			},
			west : {
				size : 250,
				spacing_closed : 22,
				togglerLength_closed : 140,
				togglerAlign_closed : "center",
				togglerContent_closed : "R<BR>e<BR>p<BR>o<BR>s",
				togglerTip_closed : "Browse Repositories",
				sliderTip : "Slide Open Repositories",
				slideTrigger_open : "mouseover"
			}
		});
		
		tree = $('#tree')
		.jstree({
			'core' : {
				'data' : {
					'url' : '/repo-editor?operation=get_node',
					'data' : function (node) {
						return { 'id' : node.id };
					}
				},
				'check_callback' : function(o, n, p, i, m) {
					if(m && m.dnd && m.pos !== 'i') { return false; }
					if(o === "move_node" || o === "copy_node") {
						if(this.get_node(n).parent === this.get_node(p).id) { return false; }
					}
					return true;
				},
				'themes' : {
					'responsive' : false,
					'variant' : 'small',
					'stripes' : true
				}
			},
			'sort' : function(a, b) {
				return this.get_type(a) === this.get_type(b) ? (this.get_text(a) > this.get_text(b) ? 1 : -1) : (this.get_type(a) >= this.get_type(b) ? 1 : -1);
			},
			'contextmenu' : {
				'items' : function(node) {
					var tmp = $.jstree.defaults.contextmenu.items();
					if(this.get_type(node)==="node-grpc"){
						return null;
					}
					delete tmp.create.action;
					if(node.text.endsWith('.wsc')){
						tmp.create.label = "New Request Call";

						tmp.create.action=function (data) {
							var inst = $.jstree.reference(data.reference),
							obj = inst.get_node(data.reference);
							inst.create_node(obj, { type : "node" }, "last", function (new_node) {
							setTimeout(function () { inst.edit(new_node)},0);
							});
						}
					}else if(this.get_type(node)==="folder"){
							tmp.create.label = "New";
							tmp.create.submenu = {
								"create_folder" : {
									"separator_after"	: true,
									"label"				: "Folder",
									"action"			: function (data) {
										var inst = $.jstree.reference(data.reference),
											obj = inst.get_node(data.reference);
										var created=inst.create_node(obj, { type : "folder", text: "new folder" }, "last");
										if(!created){
											var domobj = inst.get_node(obj,true);
											console.log(domobj);
											var cnt = $(domobj).children('ul').children().length+1;
											inst.create_node(obj, { type : "folder", text: "new folder"+cnt}, "last");
										}
									}
								},
								"create_WSC_repo" : {
									"label"				: "WSC Repo",
									"action"			: function (data) {
										var inst = $.jstree.reference(data.reference),
											obj = inst.get_node(data.reference);
										inst.get_node()
										var created = inst.create_node(obj, { type : "file-wsc", text: "newrepo.wsc"}, "last");
										console.log(created);
										if(!created){
											inst.create_node(obj, { type : "file-wsc", text: "newrepo"+$.now()+".wsc"}, "last");
										}
									}
								},
								"create_loc_repo" : {
									"label"				: "Locator Repo",
									"action"			: function (data) {
										var inst = $.jstree.reference(data.reference),
											obj = inst.get_node(data.reference);
										inst.get_node()
										var created = inst.create_node(obj, { type : "file-loc", text: "newrepo.loc"}, "last");
										console.log(created);
										if(!created){
											inst.create_node(obj, { type : "file-loc", text: "newrepo"+$.now()+".loc"}, "last");
										}
									}
								}
							};
					}
					if(this.get_type(node) === "file" || this.get_type(node) === "node" || this.get_type(node) === "file-proto") {
						delete tmp.create;
					}
					return tmp;
				}
			},
			'types' : {
				'default' : { 'icon' : 'file' },
				'folder' : { 'icon' : 'folder' },
				'file-wsc' : { 'icon' : 'file-wsc' },
				'file-loc' : { 'icon' : 'file-loc' },
				'file-proto' : { 'icon' : 'file-proto' },
				'file' : { 'valid_children' : [], 'icon' : 'file' },
				'node' : { 'valid_children' : [], 'icon' : 'node' },
				'node-grpc' : { 'valid_children' : [], 'icon' : 'node' }
			},
			'unique' : {
				'duplicate' : function (name, counter) {
					console.log(name + counter);
					if(name.endsWith(".wsc")||name.endsWith(".loc")){
						var l = name.length;
						var ext = name.substring(l-4);
						return name.substring(0,l-4)+counter+ext;
					}
					return name + ' ' + counter;
				}
			},
			'plugins' : ['state','dnd','sort','types','contextmenu','unique']
		})
		.on('delete_node.jstree', function (e, data) {
			$.get('/repo-editor?operation=delete_node', { 'id' : data.node.id })
				.fail(function () {
					data.instance.refresh();
				});
		})
		.on('create_node.jstree', function (e, data) {
			$.get('?operation=create_node', { 'type' : data.node.type, 'id' : data.node.parent, 'text' : data.node.text })
				.done(function (d) {
					data.instance.set_id(data.node, d.id);
					data.instance.set_text(data.node, d.text);
					setTimeout(function () { 
						data.instance.edit(data.node)},0);
				})
				.fail(function () {
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
		.on('rename_node.jstree', function (e, data) {
			//if(data.text!==data.old){
				$.get('/repo-editor?operation=rename_node', { 'id' : data.node.id, 'text' : data.text, 'old':data.old })
				.done(function (d) {
					data.instance.set_id(data.node, d.id);
				})
				.fail(function (e) {
					console.log(e);
					data.instance.refresh();
				});
			//}
		})
		.on('move_node.jstree', function (e, data) {
			$.get('/repo-editor?operation=move_node', { 'name' : data.node.text, 
				'parent' : data.instance.get_path(data.parent,"/"),
				'oldParent' : data.instance.get_path(data.old_parent,"/"),
				})
				.done(function (d) {
					//data.instance.load_node(data.parent);
					data.instance.refresh();
				})
				.fail(function () {
					data.instance.refresh();
				});
		})
		.on('copy_node.jstree', function (e, data) {
			$.get('/repo-editor?operation=copy_node', { 'id' : data.original.id, 'parent' : data.parent })
				.done(function (d) {
					//data.instance.load_node(data.parent);
					data.instance.refresh();
				})
				.fail(function () {
					data.instance.refresh();
				});
		})
		.on('changed.jstree', function (e, data) {
			if(data && data.selected && data.selected.length==1) {
		      	var node = data.instance.get_node(data.selected[0]);
		      	//var path = node.id.split('#',2);
		      	if(node.id.indexOf('#')>0){
		      		var path=data.instance.get_path(node.parent,"/");
		      		if(path.endsWith(".proto")){
						$.get('/repo-editor?operation=get_grpc_content',{'path': path,'name':node.text}).done(function (d) {
			        		createGrpcReqForm(d,node,path);
						});
					}else{
						$.get('/repo-editor?operation=get_wsc_content',{'path': path,'name':node.text}).done(function (d) {
			        		if(d['method'] === 'GRPC'){
			        			createGrpcReqForm(d,node,path);
							}else{
			        			createReqForm(d,node,path);
							}
						});
					}
					
		      	}else if(node.text.endsWith(".loc")){
		      		var path=data.instance.get_path(node,"/");
					$.get('/repo-editor?operation=get_content',{'path': path}).done(function (d) {
			        	createRepoEditor(d,path);
					});
		      	}else{
		      		resetContentPane();
		      		var type = data.instance.get_type(node);
		      		console.log(type);
		      		if(data.instance.get_type(node)==="default"){
						var path=data.instance.get_path(node,"/");
						var btns = '<button id="save" onclick="saveFile(\''+path+'\');" disabled="true">Save</button>';
						if(path.endsWith(".properties")){
							btns = btns + ' <button id="loadFile(\''+path+'\')" onclick="loadFile(\''+path+'\');" >Load</button>';
						}
						var html = btns +'<br/><textarea cols="100" id="file-editor" onchange="$(\'#save\').removeAttr(\'disabled\')"></textarea>';
					     	$('#editor').html(html);
		      			$.ajax({url:path,dataType : "text"}).done(function(content){
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
		(function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
	  (i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
	  m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
	  })(window,document,'script','https://www.google-analytics.com/analytics.js','ga');

	  ga('create', 'UA-83031490-1', 'auto');
	  ga('require', 'linkid');
	  ga('send', 'pageview');
	});
		
	function loadFile(path){
		$.ajax("/repo-editor?operation=save_file&path="+path);	
	}

	function saveFile(path){
		$('#save').attr('disabled','disabled');
		var content = $("#file-editor").val();
		console.log(content);
		//save_file
		$.ajax({
			type : "POST",
			url : "/repo-editor?operation=save_file&path="+path,
			data : content,
			contentType : "text/plain; charset=utf-8",
			success : function() {
				log('Saved file: ' + path);
			},
			failure : function(errMsg) {
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
				    '<li id="'+tab_id+'"><a href="#tab"'+tab_id+'">'+tab_id+'</a><i class="close-tab" onclick="closeTab(\''+tab_id+'\')">X</i></li>');
				$("div#tabs").append(
				    '<div id="'+tab_id+'"></div>');
				    //$("div#tabs").tabs("refresh");
				$("#tabs").tabs("refresh");

		} else {
			var TAB_index = $('.ui-tabs-nav li#' + tab_id).index();
			$("#tabs").tabs({
				active : TAB_index
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
			applyDefaultStyles:				true // basic styling for testing & demo purposes

			,south : {
				size : 150,
				spacing_closed : 22,
				closable : true,
				resizable : true,
				togglerAlign_closed : "left",
				togglerAlign_open : "center",
				togglerLength_closed : 140,
				togglerContent_closed : "Response",
				slideTrigger_open : "mouseover",
				initClosed: true
			},
			east : {
				size : 450,
				spacing_closed : 22,
				togglerLength_closed : 140,
				togglerAlign_closed : "center",
				togglerContent_closed : "R<BR>e<BR>p<BR>o<BR>s",
				togglerTip_closed : "Browse Repositories",
				sliderTip : "Slide Open Repositories",
				slideTrigger_open : "mouseover"
			}
	}
	
	function createGrpcReqForm(data, node, path) {
		console.log(data);
		resetContentPane();
		//grpcMethodDetailsTemplate
		try{
			$.tmpl(grpcMethodDetailsTemplate, data).appendTo("#editor");
			window[ 'innerLayout' ] = $("#editor").layout(layoutSettings_Inner);
			$('#wsc-tabs').tabs();
			$('#editor button').each(function (){$(this).button();});
			$("#wsc-view pre").text(JSON.stringify(data.input, null, '  ').replaceAll('\\n','\n'));

		}catch(e){
			
		}
	}

	//form functions
	function createReqForm(data, node, path) {
		resetContentPane();
		
		try{
			$.tmpl(methodDetailsTemplate, data).appendTo("#editor");
			if(node){
				$('#save').removeAttr('disabled');
				$("#save").click(function(){saveReqForm(node, path);});
				$("#reset").click(function(){createReqForm(data, node, path);});

			}else{
				$("#save").attr('disabled','disabled');;
			}
			//http://layout.jquery-dev.net/tips.html
			//$.extend( layoutSettings_Inner, layoutState.load(window['innerLayout']));
			window[ 'innerLayout' ] = $("#editor").layout(layoutSettings_Inner);
			$('#wsc-tabs').tabs();
		$('#editor button').each(function (){$(this).button();});

			loadWSCView(data);
			
		}catch(e){
			console.log(e);
		}
	}
	
	function loadWSCView(data){
		var stepcall = {
			step:'resolveWSCwithData',
			args:[JSON.stringify(data),data['run-parameters']||{}]
		}
		$.ajax({
			type : "POST",
			url : "/executeStep",
			data : JSON.stringify(stepcall),
			contentType : "application/json; charset=utf-8",
			//dataType : "json",
			success : function(res) {
				if(res.result){
					$("#wsc-view pre").text(JSON.stringify(res.result, null, '  '));
				}else{
					log('Unexpected response: ' + JSON.stringify(res));
					$("#wsc-view pre").text(JSON.stringify(data, null, '  '));
				}
			},
			failure : function(errMsg) {
				log('Error:: ' + errMsg);
				$("#wsc-view pre").text(JSON.stringify(data, null, '  '));
			}
		});
	}
	function updateWSCView(){
		var data=getFormData();
		loadWSCView(data);
	}
	function resetContentPane(){
		try{
			//$("#inner").layout().destroy();
			var $C = $('#editor');
			//save state
			//layoutState.save(window['innerLayout']);
			if ($C.data("layoutContainer"))
				$C.layout().destroy();
			window[ 'innerLayout' ]=null;

		}catch(e){}
		$('#editor').html('');
	}
	var locRepoEditorTmpl = '<div class="header">'
		+'	<button id="save">Save</button>'
		+'</div>'
		+'<div id="loc-editor-container"> </div>';

	function createRepoEditor(data,path){
		resetContentPane();
		$.tmpl(locRepoEditorTmpl).appendTo("#editor");
        if(!data || data.length<=0){
        	data = [{
        			key:'',locator:''
        	}];
        }
        
        $('#loc-editor-container').html(makeTable(data));
        $('.json_table').addClass('table table-bordered table-striped table-hover table-sm');
        $('.json_table thead').addClass('thead-dark');
		
		$("#save").click(function(){
			//log(JSON.stringify(makeJson()));

			$.ajax({
				type : "POST",
				url : "/repo-editor?operation=save_loc&path="+path,
				data : JSON.stringify(makeJson()),
				contentType : "application/json; charset=utf-8",
				dataType : "json",
				success : function(data) {
					log(JSON.stringify(data));
				},
				failure : function(errMsg) {
					alert(errMsg);
				}
			}); 
		});
	}
	
	function saveReqForm(node, path){
		node.data=getFormData();
		console.log("saving "+node.data +" in " +path);
		save(node.text, path, node.data)
	}
	//SAVE/UPDATE REQCALL (CERATE FILE/FOLDER ON SAVING/UPDATING REQCALL ONLY)
	function save(nodename, path, data){
		//var endpoint = "/"+path+"?name="+nodename;
		var endpoint = "/repo-editor?operation=save_wsc&path="+path+"&name="+nodename;

		$.ajax({
			type : "POST",
			url : endpoint,
			data : JSON.stringify(data),
			contentType : "application/json; charset=utf-8",
			dataType : "json",
			success : function(data) {
				log(JSON.stringify(data));
			},
			failure : function(errMsg) {
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

		return reqcall;
	}

	function execute() {
		var reqcall = getFormData();
		$.ajax({
			type : "POST",
			url : "/executeRequest",
			data : JSON.stringify([reqcall,reqcall['run-parameters']||{}]),
			contentType : "application/json; charset=utf-8",
			//dataType : "json",
			success : function(data, status, xhr) {
				//console.log(xhr);
				if(typeof data === 'object' ){
					showResponse(data);
					log(data);

					window[ 'innerLayout' ].open('south');
				}else{
					log(data);
				}
			},
			failure : function(errMsg) {
				log(errMsg);
			}
		});
	}
	
	function executeGrpc() {
		var reqcall = getFormData();
		var endpoint = reqcall['endpoint'];
		if(reqcall['baseurl']){
			endpoint = reqcall['baseurl']+'/'+endpoint;
		}
		console.log(reqcall);
		var stepcall = {
			step:'callGrpcMethodUsingData',
			args:[endpoint,reqcall['body'],reqcall['run-parameters']||{}]
		}
		$.ajax({
			type : "POST",
			url : "/executeStep",
			data : JSON.stringify(stepcall),
			contentType : "application/json; charset=utf-8",
			//dataType : "json",
			success : function(data, status, xhr) {
				//console.log(xhr);
				if(typeof data === 'object' &&  data.result){
					showResponse(data.result);
					log(data);
					window[ 'innerLayout' ].open('south');
				}else{
					log(data);
				}
			},
			failure : function(errMsg) {
				log(errMsg);
			}
		});
	}
	
	function log(message){
		if(typeof message === 'object')
			message = JSON.stringify(message);
		
		var console = $('#console');
		console.append('<p><pre>['+new Date().toLocaleTimeString()+'] '+message+'</pre></p>');
		console.parent().scrollTop(console.parent().prop("scrollHeight"));
	}
	function showResponse(data){
		if ($("#response #tabs").length <= 0){
			$('#response').html('<div id="tabs"><ul></ul></div>');
			$("#tabs ul").append('<li><a href="#tabs-0">Response</a></li>');
            $("#tabs ul").after("<div id='tabs-0'></div>");
			$("#tabs ul").append('<li><a href="#tabs-1">Headers</a></li>');
            $("#tabs ul").after("<div id='tabs-1'></div>");
            $("#tabs ul").append('<li><a href="#tabs-2">Body</a></li>');
            $("#tabs ul").after("<div id='tabs-2'></div>");
            $( "#tabs" ).tabs({event: "mouseover"});
		}

		var body = data["messageBody"] ||data["body"]; 
		if(data["headers"]){
			$("#tabs-1").html(Object.keys(data["headers"]).map(function(key) {
                    return '<b>'+(key) + '</b>: ' +
                        (data["headers"][key]);
               		 }).join('<br/>'));	
		}
		 
         var mediaType = data['mediaType'] || ""; 
	     if(mediaType.indexOf('html')>=0){
			 	$("#tabs-2").html(data["messageBody"]);
			}else if(mediaType.indexOf('json')>=0){
				$("#tabs-2").html('<pre></pre>');
				$("#tabs-2 pre").text(data["messageBody"]);
			 	//$("#tabs-2").html('<pre>'+JSON.stringify(data["messageBody"],null,'\t')+'</pre>');
			}
			else{
				$("#tabs-2").html('<pre></pre>');
				$("#tabs-2 pre").text(body);
			}
		delete data["headers"];
		delete data["messageBody"];
		delete data["body"];

        $("#tabs-0").html(Object.keys(data).map(function(key) {
                    return '<b>'+(key) + '</b>: ' +
                        (JSON.stringify(data[key],null,'\t'));
               		 }).join('<br/>'));
         
	}
	function add(m, f) {
		var val = $("[name=" + f + "]").val();
		if (val && val.trim().length>0) {
			m[f] = val.trim();
		}
	}
	function addEntries(m, f) {
		var entries = {};
		$("#tbl" + toId(f)+ " tr").each(
				function() {
					if($(this).find("input").length>0){
						var key = $(this).find("input").first().val().trim();
						if(key.length>0){
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
		$.tmpl(kvTemplate, {"":""}).appendTo("#" + f);
	}
	function removeEntry(f) {
		$(f).parent().parent().remove();
		updateWSCView();
	}
	var testdata = {
		baseurl : "http://www.google.com",
		endpoint : "",
		//method:"GET",
		headers : {
			header1 : "value1",
			header2 : "value2"
		},
		queryParameters : {
			user : "test",
			pwd : "test123#"
		}
	};
	
	function toId(str){
		return str.replace(/[^a-zA-Z]/g, "");
	} 