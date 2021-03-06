/**
 * Firefox driver
 */

(function() {
	//'use strict';

	if ( wappalyzer == null ) return;

	var w = wappalyzer, prefs, strings, $;

	const
		Cc = Components.classes,
		Ci = Components.interfaces
		;

	w.driver = {
		lastDisplayed: null,

		/**
		 * Log messages to console
		 */
		log: function(args) {
			if ( prefs != null && prefs.getBoolPref('debug') ) {
				Cc['@mozilla.org/consoleservice;1'].getService(Ci.nsIConsoleService).logStringMessage(args.message);
			}
		},

		/**
		 * Initialize
		 */
		init: function(callback) {
			var handler = function() {
				window.removeEventListener('load', handler, false);

				w.log('w.driver: browser window loaded');

				strings = document.getElementById('wappalyzer-strings');

				// Read apps.json
				var xhr = Cc['@mozilla.org/xmlextras/xmlhttprequest;1'].createInstance(Ci.nsIXMLHttpRequest);

				xhr.overrideMimeType('application/json');

				xhr.open('GET', 'chrome://wappalyzer/content/apps.json', true);

				xhr.onload = function() {
					var json = JSON.parse(xhr.responseText);

					w.categories = json.categories;
					w.apps       = json.apps;
				};

				xhr.send(null);

				AddonManager.getAddonByID('wappalyzer@crunchlabz.com', function(addon) {
					// Load jQuery
					Cc['@mozilla.org/moz/jssubscript-loader;1'].getService(Ci.mozIJSSubScriptLoader).loadSubScript('chrome://wappalyzer/content/js/lib/jquery.min.js');

					$ = jQuery;

					jQuery.noConflict(true);

					// Preferences
					prefs = Cc['@mozilla.org/preferences-service;1'].getService(Ci.nsIPrefService).getBranch('extensions.wappalyzer.');

					prefs.addObserver('', w.driver, false);

					container();

					bindings();

					// Version check
					addon.version = addon.version;

					if ( !prefs.getCharPref('version') ) {
						w.config.firstRun = true;
					} else if ( prefs.getCharPref('version') != addon.version ) {
						w.config.upgraded = true;
					}

					prefs.setCharPref('version', addon.version);

					// Listen for messages from content script
					messageManager.addMessageListener('wappalyzer', content);

					// Load content script
					messageManager.loadFrameScript('chrome://wappalyzer/content/js/content.js', true);

					gBrowser.addProgressListener({
						// Listen for location changes
						onLocationChange: function(progress, request, location, flags) {
							w.driver.displayApps();
						},

						// Get response headers
						onStateChange: function(progress, request, flags, status) {
							if ( !prefs.getBoolPref('analyzeHeaders') ) { return; }

							if ( request != null && flags & Ci.nsIWebProgressListener.STATE_STOP ) {
								if ( request.nsIHttpChannel && request.contentType == 'text/html' ) {
									if ( progress.currentURI && request.name == progress.currentURI.spec ) {
										var headers = new Object();

										request.nsIHttpChannel.visitResponseHeaders(function(header, value) {
											headers[header] = value;
										});

										w.analyze(progress.currentURI.host, progress.currentURI.spec, { headers: headers });
									}
								}
							}
						}
					});

					gBrowser.tabContainer.addEventListener('TabSelect', w.driver.displayApps, false);

					callback();
				});
			};

			window.addEventListener('load',   handler,        false);
			window.addEventListener('unload', w.driver.track, false);
		},

		// Observe preference changes
		observe: function(subject, topic, data) {
			if ( topic != 'nsPref:changed' ) { return; }

			switch(data) {
				case 'addonBar':
					container();

					break;
			}

			w.driver.displayApps();
		},

		/**
		 * Display apps
		 */
		displayApps: function() {
			var menuItem, menuSeparator, image, url = gBrowser.currentURI.spec.split('#')[0];

			if ( w.detected[url] != null && w.detected[url].length ) {
				// No change
				if ( w.driver.lastDisplayed === JSON.stringify(w.detected[url]) ) { return; }
			} else {
				if ( w.driver.lastDisplayed === 'empty' ) { return; }
			}

			$('#wappalyzer-container > image, #wappalyzer-menu > menuitem, #wappalyzer-menu > menuseparator').attr('class', 'wappalyzer-remove');

			if ( w.detected[url] != null && w.detected[url].length ) {
				if ( !prefs.getBoolPref('showIcons') ) {
					$('<image>').attr('src', 'chrome://wappalyzer/skin/images/icon_hot.png').prependTo(document.getElementById('wappalyzer-container'));
				}

				w.detected[url].map(function(app, i) {
					var j, cat, showCat, categories = [];

					for ( i in w.apps[app].cats ) {
						showCat = false;

						try {
							showCat = prefs.getBoolPref('cat' + w.apps[app].cats[i]);
						} catch(e) { }

						if ( showCat ) {
							$('<menuseparator>').appendTo(document.getElementById('wappalyzer-menu'));

							$('#wappalyzer-menu')
								.append($('<menuitem>')
								.attr('class', 'wappalyzer-application menuitem-iconic')
								.attr('image', 'chrome://wappalyzer/skin/images/icons/' + app + '.png')
								.attr('label', app)
								.attr('name', app)
								.on('command', function() {
									w.driver.goToURL({ url: w.config.websiteURL + 'applications/' + app.toLowerCase().replace(/ /g, '-').replace(/[^\w-]/g, '') });
								}));

							for ( j in w.apps[app].cats ) {
								cat = w.apps[app].cats[j];

								categories.push(strings.getString('wappalyzer.cat' + cat));

								$('#wappalyzer-menu')
									.append($('<menuitem>')
									.attr('class', 'wappalyzer-category')
									.attr('label', strings.getString('wappalyzer.cat' + cat))
									.on('command', function() {
										w.driver.goToURL({ url: w.config.websiteURL + 'categories/' + w.categories[cat] });
									}));
							}

							if ( prefs.getBoolPref('showIcons') ) {
								$('<image>')
									.attr('src', 'chrome://wappalyzer/skin/images/icons/' + app + '.png')
									.attr('tooltiptext', app + ' - ' + categories.join(', '))
									.prependTo(document.getElementById('wappalyzer-container'))
									;
							}

							break;
						}
					}
				});

				w.driver.lastDisplayed = JSON.stringify(w.detected[url]);
			} else {
				$('<image>')
					.attr('src', 'chrome://wappalyzer/skin/images/icon.png')
					.prependTo(document.getElementById('wappalyzer-container'));

				$('<menuseparator>').appendTo(document.getElementById('wappalyzer-menu'));

				$('<menuitem>')
					.attr('disabled', 'true')
					.attr('label', strings.getString('wappalyzer.noAppsDetected'))
					.appendTo(document.getElementById('wappalyzer-menu'));

				w.driver.lastDisplayed = 'empty';
			}

			$('.wappalyzer-remove').remove();
		},

		/**
		 * Go to URL
		 */
		goToURL: function(args) {
			gBrowser.selectedTab = gBrowser.addTab(args.url + '?utm_source=firefox&utm_medium=extension&utm_campaign=extensions');
		},

		/**
		 * Anonymously track detected applications for research purposes
		 */
		ping: function() {
			if ( Object.keys(w.ping.hostnames).length && prefs.getBoolPref('tracking') ) {
				// Make POST request
				var request = new XMLHttpRequest();

				request.open('POST', w.config.websiteURL + 'ping/', true);

				request.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');

				request.onreadystatechange = function(e) {
					if ( request.readyState == 4 ) { w.log('w.driver.ping: status ' + request.status); }
				};

				request.send('json=' + encodeURIComponent(JSON.stringify(w.ping)));

				w.log('w.driver.ping: ' + JSON.stringify(w.ping));

				w.ping = {};
			}
		}
	};

	/**
	 * Content message listener
	 */
	function content(msg) {
		w.log('content.js');

		switch ( msg.json.action ) {
			case 'analyze':
				w.analyze(msg.json.hostname, msg.json.url, msg.json.analyze);

				break;
			case 'get prefs':
				return {
					analyzeJavaScript: prefs.getBoolPref('analyzeJavaScript'),
					analyzeOnLoad:     prefs.getBoolPref('analyzeOnLoad')
					};

				break;
		}

		msg = null;
	}

	/**
	 * Move container to address or addon bar
	 */
	function container() {
		if ( prefs.getBoolPref('addonBar') ) {
			$('#wappalyzer-container').prependTo(document.getElementById('wappalyzer-addonbar'));

		} else {
			$('#wappalyzer-container').prependTo(document.getElementById('urlbar-icons'));

			$('#wappalyzer-addonbar').attr('collapsed', 'true');
		}
	}

	/**
	 * Bindings
	 */
	function bindings() {
		// Menu items
		var prefix = 'wappalyzer-menu-';

		document.getElementById(prefix + 'preferences').onclick = function() {
				w.driver.goToURL({ url: 'chrome://wappalyzer/content/xul/preferences.xul' })
			};

		document.getElementById(prefix + 'feedback').onclick = function() {
				w.driver.goToURL({ url: w.config.websiteURL + 'contact' })
			};

		document.getElementById(prefix + 'website').onclick = function() {
				w.driver.goToURL({ url: w.config.websiteURL })
			};

		document.getElementById(prefix + 'github').onclick = function() {
				w.driver.goToURL({ url: w.config.githubURL })
			};

		document.getElementById(prefix + 'twitter').onclick = function() {
				w.driver.goToURL({ url: w.config.twitterURL })
			};
	}

	w.init();
})();
