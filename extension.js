//vim: expandtab shiftwidth=4 tabstop=8 softtabstop=4 encoding=utf-8 textwidth=99
/* -*- mode: js2; js2-basic-offset: 4; indent-tabs-mode: nil -*- */

// Gnome Shell Window List - Bottom Panel Version
// Combines Frippery panel location with aesthetically pleasing panel from the authors below
//
// 
// Author:
//   Bill Smith <snowmanam2@gmail.com>
//   License: GPLv2+
//
// Original code by:
//   Kurt Rottmann <kurtrottmann@gmail.com>
//   Jason Siefken
//
// Also taking code from:
//   Copyright (C) 2011 R M Yorston
//   Licence: GPLv2+
//   http://intgat.tigress.co.uk/rmy/extensions/gnome-shell-frippery-0.2.3.tgz

const Clutter = imports.gi.Clutter;
const Lang = imports.lang;
const Shell = imports.gi.Shell;
const St = imports.gi.St;
const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const Tweener = imports.ui.tweener;
const Overview = imports.ui.overview;
const Panel = imports.ui.panel;
const PopupMenu = imports.ui.popupMenu;
const PanelMenu = imports.ui.panelMenu;
const Signals = imports.signals;

// Load our extension so we can access other files in our extensions dir as libraries
const Extension = imports.misc.extensionUtils.getCurrentExtension();
const SpecialMenus = Extension.imports.specialMenus;
const Lib = Extension.imports.lib;

let windowList = null, restoreState={}, bottomPanel=null, settings = null;


function AppMenuButton(app, metaWindow, animation) {
    this._init(app, metaWindow, animation);
}

AppMenuButton.prototype = {
    _init: function(app, metaWindow, animation) {

        this.actor = new St.Bin({ style_class: 'panel-button',
                                  reactive: true,
                                  can_focus: true,
                                  x_fill: true,
                                  y_fill: false,
                                  track_hover: true });
        this.actor._delegate = this;
        this.actor.connect('button-release-event', Lang.bind(this, this._onButtonRelease));
        this.metaWindow = metaWindow;
        this.app = app;

        this.metaWindow.connect('notify::title', Lang.bind(this, this._onTitleChange));

        let bin = new St.Bin({ name: 'appMenu' });
        this.actor.set_child(bin);

        this._container = new Shell.GenericContainer();
        bin.set_child(this._container);
        this._container.connect('get-preferred-width', Lang.bind(this, this._getContentPreferredWidth));
        this._container.connect('get-preferred-height', Lang.bind(this, this._getContentPreferredHeight));
        this._container.connect('allocate', Lang.bind(this, this._contentAllocate));

        this._iconBox = new Shell.Slicer({ name: 'appMenuIcon' });
        this._iconBox.connect('style-changed', Lang.bind(this, this._onIconBoxStyleChanged));
        this._iconBox.connect('notify::allocation', Lang.bind(this, this._updateIconBoxClip));
        this._container.add_actor(this._iconBox);
        this._label = new Panel.TextShadower();
        this._container.add_actor(this._label.actor);

        this._iconBottomClip = 0;

        this._visible = !Main.overview.visible;
        if (!this._visible)
            this.actor.hide();
        Main.overview.connect('hiding', Lang.bind(this, function () {
            this.show(); 
        }));
        Main.overview.connect('showing', Lang.bind(this, function () {
            this.hide();
        }));

        this._spinner = new Panel.AnimatedIcon('process-working.svg', settings.get_int("panel-icon-size"));
        this._container.add_actor(this._spinner.actor);
        this._spinner.actor.lower_bottom();

        let icon = this.app.get_faded_icon(2 * settings.get_int("panel-icon-size"));
        this._onTitleChange();
        this._iconBox.set_child(icon);

        if(animation){
            this.startAnimation(); 
            this.stopAnimation();
        }

        // Set up the right click menu
        this.rightClickMenu = new SpecialMenus.RightClickAppPopupMenu(this.actor, this.metaWindow, this.app);
        this.menuManager = new PopupMenu.PopupMenuManager({actor: this.actor});
        this.menuManager.addMenu(this.rightClickMenu);
        if (settings.get_boolean ("show-hover-menu")) this.hovCont = new SpecialMenus.HoverMenuController(this.actor, 
                                    new SpecialMenus.AppThumbnailHoverMenu(this.actor, this.metaWindow, this.app));

    },

    _onTitleChange: function() {
        this._label.setText(this.metaWindow.get_title());
    },

    doFocus: function() {

        if ( this.metaWindow.has_focus() ) {
            this.actor.add_style_pseudo_class('active');
        } else {
            this.actor.remove_style_pseudo_class('active');
        }
    },

    _onButtonRelease: function(actor, event) {
        if ( event.get_state() & Clutter.ModifierType.BUTTON1_MASK ) {
            if ( this.rightClickMenu.isOpen ) {
                this.rightClickMenu.toggle();
            }
            if ( this.metaWindow.has_focus() ) {
                this.metaWindow.minimize(global.get_current_time());
            } else {
                this.metaWindow.activate(global.get_current_time());
            }
        }
    },

    show: function() {
        if (this._visible)
            return;
        this._visible = true;
        this.actor.show();
    },

    hide: function() {
        if (!this._visible)
            return;
        this._visible = false;
        this.actor.hide();
    },

    _onIconBoxStyleChanged: function() {
        let node = this._iconBox.get_theme_node();
        this._iconBottomClip = node.get_length('app-icon-bottom-clip');
        this._updateIconBoxClip();
    },

    _updateIconBoxClip: function() {
        let allocation = this._iconBox.allocation;
        if (this._iconBottomClip > 0)
            this._iconBox.set_clip(0, 0,
                                   allocation.x2 - allocation.x1,
                                   allocation.y2 - allocation.y1 - this._iconBottomClip);
        else
            this._iconBox.remove_clip();
    },

    stopAnimation: function() {
        Tweener.addTween(this._spinner.actor,
                         { opacity: 0,
                           time: settings.get_int("spinner-animation-time"),
                           transition: "easeOutQuad",
                           onCompleteScope: this,
                           onComplete: function() {
                               this._spinner.actor.opacity = 255;
                               this._spinner.actor.hide();
                           }
                         });
    },

    startAnimation: function() {
        this._spinner.actor.show();
    },

    _getContentPreferredWidth: function(actor, forHeight, alloc) {
        let [minSize, naturalSize] = this._iconBox.get_preferred_width(forHeight);
        alloc.min_size = minSize;
        alloc.natural_size = naturalSize;
        [minSize, naturalSize] = this._label.actor.get_preferred_width(forHeight);
        alloc.min_size = alloc.min_size + Math.max(0, minSize - Math.floor(alloc.min_size / 2));
        
        /* Modified: add a maximum size for sanity - assume is larger than minSize */
        alloc.natural_size = alloc.natural_size + Math.max(settings.get_int("button-min-size"),
            Math.min(Math.max(0, naturalSize - Math.floor(alloc.natural_size / 2)), settings.get_int("button-max-size")));
    },

    _getContentPreferredHeight: function(actor, forWidth, alloc) {
        let [minSize, naturalSize] = this._iconBox.get_preferred_height(forWidth);
        alloc.min_size = minSize;
        alloc.natural_size = naturalSize;
        [minSize, naturalSize] = this._label.actor.get_preferred_height(forWidth);
        if (minSize > alloc.min_size)
            alloc.min_size = minSize;
        if (naturalSize > alloc.natural_size)
            alloc.natural_size = naturalSize;
    },

    _contentAllocate: function(actor, box, flags) {
        let allocWidth = box.x2 - box.x1;
        let allocHeight = box.y2 - box.y1;
        let childBox = new Clutter.ActorBox();

        let [minWidth, minHeight, naturalWidth, naturalHeight] = this._iconBox.get_preferred_size();

        let direction = this.actor.get_text_direction();

        let yPadding = Math.floor(Math.max(0, allocHeight - naturalHeight) / 2);
        childBox.y1 = yPadding;
        childBox.y2 = childBox.y1 + Math.min(naturalHeight, allocHeight);
        if (direction == Clutter.TextDirection.LTR) {
            childBox.x1 = 0;
            childBox.x2 = childBox.x1 + Math.min(naturalWidth, allocWidth);
        } else {
            childBox.x1 = Math.max(0, allocWidth - naturalWidth);
            childBox.x2 = allocWidth;
        }
        this._iconBox.allocate(childBox, flags);

        let iconWidth = childBox.x2 - childBox.x1;

        [minWidth, minHeight, naturalWidth, naturalHeight] = this._label.actor.get_preferred_size();

        yPadding = Math.floor(Math.max(0, allocHeight - naturalHeight) / 2);
        childBox.y1 = yPadding;
        childBox.y2 = childBox.y1 + Math.min(naturalHeight, allocHeight);

        if (direction == Clutter.TextDirection.LTR) {
            childBox.x1 = Math.floor(iconWidth / 2);
            childBox.x2 = Math.min(childBox.x1 + naturalWidth, allocWidth);
        } else {
            childBox.x2 = allocWidth - Math.floor(iconWidth / 2);
            childBox.x1 = Math.max(0, childBox.x2 - naturalWidth);
        }
        this._label.actor.allocate(childBox, flags);

        if (direction == Clutter.TextDirection.LTR) {
            childBox.x1 = Math.floor(iconWidth / 2) + this._label.actor.width;
            childBox.x2 = childBox.x1 + this._spinner.actor.width;
            childBox.y1 = box.y1;
            childBox.y2 = box.y2 - 1;
            this._spinner.actor.allocate(childBox, flags);
        } else {
            childBox.x1 = -this._spinner.actor.width;
            childBox.x2 = childBox.x1 + this._spinner.actor.width;
            childBox.y1 = box.y1;
            childBox.y2 = box.y2 - 1;
            this._spinner.actor.allocate(childBox, flags);
        }
    }
};

function _moveMessageTrayUp()
{
    let primary = Main.layoutManager.primaryMonitor;
    Main.layoutManager.trayBox.set_position(primary.x, primary.y+primary.height - bottomPanel.actor.get_theme_node().get_height());
}

function _moveMessageTrayDown()
{
    let primary = Main.layoutManager.primaryMonitor;
    Main.layoutManager.trayBox.set_position(primary.x, primary.y+primary.height);
}

function refreshPanel(wl) 
{
    if (bottomPanel != null && !wl.hiding) {
        if (wl._windows.length == 0) {
            bottomPanel.actor.hide();
            _moveMessageTrayDown();
        }
        else { 
            bottomPanel.actor.show();
            _moveMessageTrayUp(); 
        }
    }
}

function WindowList() {
    this._init();
}

WindowList.prototype = {
    _init: function() {
        this.actor = new St.BoxLayout({ name: 'windowList',
                                        style_class: 'window-list-box' });
        this.actor._delegate = this;
        this._windows = [];
        this.hiding = false;

        let tracker = Shell.WindowTracker.get_default();
        tracker.connect('notify::focus-app', Lang.bind(this, function(){this._onFocus();}));

        global.window_manager.connect('switch-workspace', Lang.bind(this, function(){this._refreshItems();}));

        this._workspaces = [];
        this._changeWorkspaces();
        global.screen.connect('notify::n-workspaces', Lang.bind(this, this._changeWorkspaces));

        Main.panel.actor.connect('allocate', Lang.bind(Main.panel, this._allocateBoxes));
        this._hideId = Main.overview.connect('hiding', Lang.bind(this, function () {
            this.hiding = false;
            refreshPanel(this); 
        }));
        this._showId = Main.overview.connect('showing', Lang.bind(this, function () {
            this.hiding = true;
            bottomPanel.actor.hide();
            _moveMessageTrayDown();
        }));
        
        this._settingsChangedId = settings.connect('changed', Lang.bind(this, function (){ 
            this._refreshItems();
        }));
        
        this._refreshItems();
    },
    
    destroy: function() {
        for ( let i=0; i<this._workspaces.length; ++i ) {
            let ws = this._workspaces[i];
            ws.disconnect(ws._windowAddedId);
            ws.disconnect(ws._windowRemovedId);
        }
        
        Main.overview.disconnect (this._hideId);
        Main.overview.disconnect (this._showId);
        settings.disconnect(this._settingsChangedId);
        
        this.actor.destroy();
    },

    _onFocus: function() {
        
        for ( let i = 0; i < this._windows.length; i++) {
            this._windows[i].doFocus();
        } 
    },

    _refreshItems: function() {
        this.actor.destroy_all_children();
        this._windows.length = 0;  // Modified to avoid referencing problems

        let metaWorkspace = global.screen.get_active_workspace();
        let windows = metaWorkspace.list_windows();
        windows.sort(function(w1, w2) {
            return w1.get_stable_sequence() - w2.get_stable_sequence();
        });

        // Create list items for each window
        let tracker = Shell.WindowTracker.get_default();
        let j = 0; // use a secondary index to prevent non-sequential array problems
        
        for ( let i = 0; i < windows.length; ++i ) {
            
            let metaWindow = windows[i];
            if ( metaWindow && (tracker.is_window_interesting(metaWindow) || settings.get_boolean("show-uninteresting-windows")) ) {
                let app = tracker.get_window_app(metaWindow);
                if ( app ) {
                    this._windows[j] = new AppMenuButton(app, metaWindow, false);
                    this.actor.add(this._windows[j].actor);
                    j++;
                }
            }
        }

        refreshPanel(this);
        
    },

    _windowAdded: function(metaWorkspace, metaWindow) {
        if ( metaWorkspace.index() != global.screen.get_active_workspace_index() ) {
            return;
        }

        for ( let i=0; i<this._windows.length; i++ ) {
            if ( this._windows[i].metaWindow == metaWindow ) {
                return;
            }
        }

        let tracker = Shell.WindowTracker.get_default();
        let app = tracker.get_window_app(metaWindow);
        
        
        if ( app && (tracker.is_window_interesting(metaWindow) || settings.get_boolean("show-uninteresting-windows")) ) {
            let len = this._windows.length;
            this._windows[len] = new AppMenuButton(app, metaWindow, true);
            this.actor.add(this._windows[len].actor);
            this._windows[len].actor.show();
            
        } 
        
        refreshPanel(this);
    },

    _windowRemoved: function(metaWorkspace, metaWindow) {
        if ( metaWorkspace.index() != global.screen.get_active_workspace_index() ) {
            return;
        }

        for ( let i=0; i<this._windows.length; ++i ) {
            if ( this._windows[i].metaWindow == metaWindow ) {
                this.actor.remove_actor(this._windows[i].actor);
                this._windows[i].actor.destroy();
                this._windows.splice(i, 1);
                break;
            }
        }
        
        refreshPanel(this);
    },

    _changeWorkspaces: function() {
    
        for ( let i=0; i<this._workspaces.length; ++i ) {
            let ws = this._workspaces[i];
            ws.disconnect(ws._windowAddedId);
            ws.disconnect(ws._windowRemovedId);
        }

        this._workspaces.length = 0;
        for ( let i=0; i<global.screen.n_workspaces; ++i ) {
            let ws = global.screen.get_workspace_by_index(i);
            this._workspaces[i] = ws;
            ws._windowAddedId = ws.connect('window-added', Lang.bind(this, this._windowAdded));
            ws._windowRemovedId = ws.connect('window-removed', Lang.bind(this, this._windowRemoved));
        }
        
        refreshPanel(this);
    },

    _allocateBoxes: function(container, box, flags) {    
        let allocWidth = box.x2 - box.x1;
        let allocHeight = box.y2 - box.y1;
        let [leftMinWidth, leftNaturalWidth] = this._leftBox.get_preferred_width(-1);
        let [centerMinWidth, centerNaturalWidth] = this._centerBox.get_preferred_width(-1);
        let [rightMinWidth, rightNaturalWidth] = this._rightBox.get_preferred_width(-1);

        let sideWidth, centerWidth;
        centerWidth = centerNaturalWidth;
        sideWidth = (allocWidth - centerWidth) / 2;

        let childBox = new Clutter.ActorBox();

        childBox.y1 = 0;
        childBox.y2 = allocHeight;
        if (this.actor.get_text_direction() == Clutter.TextDirection.RTL) {
            childBox.x1 = allocWidth - Math.min(allocWidth - rightNaturalWidth, leftNaturalWidth);
            childBox.x2 = allocWidth;
        } else {
            childBox.x1 = 0;
            childBox.x2 = Math.min(allocWidth - rightNaturalWidth, leftNaturalWidth);
        }
        this._leftBox.allocate(childBox, flags);

        childBox.x1 = Math.ceil(sideWidth);
        childBox.y1 = 0;
        childBox.x2 = childBox.x1 + centerWidth;
        childBox.y2 = allocHeight;
        this._centerBox.allocate(childBox, flags);

        childBox.y1 = 0;
        childBox.y2 = allocHeight;
        if (this.actor.get_text_direction() == Clutter.TextDirection.RTL) {
            childBox.x1 = 0;
            childBox.x2 = Math.min(Math.floor(sideWidth), rightNaturalWidth);
        } else {
            childBox.x1 = allocWidth - Math.min(Math.floor(sideWidth), rightNaturalWidth);
            childBox.x2 = allocWidth;
        }
        this._rightBox.allocate(childBox, flags);
    }
};

// A widget that won't get squished
// and won't continually resize when the text inside
// it changes, provided the number of characters inside
// doesn't change
function StableLabel(dateMenu) {
    this._init.call(this, dateMenu);
}

StableLabel.prototype = {
    _init: function(dateMenu) {
        this.actor = new Shell.GenericContainer({ visible: true,
                                                  reactive: true });
        this.actor.connect('get-preferred-width', Lang.bind(this, this._getPreferredWidth));
        this.actor.connect('get-preferred-height', Lang.bind(this, this._getPreferredHeight));
        this.actor.connect('allocate', Lang.bind(this, this._allocate));

        this._dateMenu = dateMenu.actor;
        this.label = dateMenu._clock;

        // We keep track of the current maximum width
        // needed to display the label.  As long as the number
        // of character is the label doesn't change, our width
        // should be monotone increasing
        this.width = 0;
        this.numChars = 0;

        this.actor.add_actor(this._dateMenu);
    },

    destroy: function() {
        this.actor.destroy();
        this._dateMenu = null;
        this.label = null;
    },

    _getPreferredWidth: function(actor, forWidth, alloc) {
        let [minWidth, preferredWidth] = this._dateMenu.get_preferred_width(forWidth);

        this.width = Math.max(this.width, preferredWidth);
        if (this.label.text.length != this.numChars) {
            this.numChars = this.label.text.length;
            this.width = preferredWidth;
        }

        alloc.min_size = this.width;
        alloc.natural_size = this.width;
    },

    _getPreferredHeight: function(actor, forHeight, alloc) {
        let [minHeight, preferredHeight] = this._dateMenu.get_preferred_width(forHeight);
        alloc.min_size = minHeight;
        alloc.natural_size = preferredHeight;
    },

    _allocate: function(actor, box, flags) {
        let childBox = new Clutter.ActorBox();

        childBox.x1 = 0;
        childBox.y1 = 0;
        childBox.x2 = this.actor.width;
        childBox.y2 = this.actor.height;
        this._dateMenu.allocate(childBox, flags);
    }
};

BottomPanel.prototype = {
    _init : function() {
        this.actor = new St.BoxLayout({ style_class: 'bottom-panel',
                                        name: 'bottomPanel',
                                        reactive: true });
        this.actor._delegate = this;

        let windowList = new WindowList();
        this.actor.add(windowList.actor, { expand: true });

        Main.layoutManager.addChrome(this.actor, { affectsStruts: true });

        this.actor.connect('style-changed', Lang.bind(this, this.relayout));
        global.screen.connect('monitors-changed', Lang.bind(this,
                                                     this.relayout));
                                                                                                
    },

    relayout: function() {
        let primary = Main.layoutManager.primaryMonitor;

        let h = this.actor.get_theme_node().get_height();
        this.actor.set_position(primary.x, primary.y+primary.height-h);
        this.actor.set_size(primary.width, h);
    },
    
    destroy: function () {
        Main.layoutManager.removeChrome(this.actor);
        this.actor.destroy();
    }
};

function BottomPanel() {
    
    this._init();

}


function init() {
    
}

function enable() {
   
    if (settings == null) {
        settings = Lib.getSettings ();
    }  
   
    windowList = new WindowList(); 
    bottomPanel = new BottomPanel();
    
    bottomPanel.relayout();
}

function disable() {
    
    if (bottomPanel) {
        bottomPanel.destroy();
        bottomPanel = null;
    }
    if (windowList) {
        windowList.destroy();
        windowList  = null;
    }
    
    _moveMessageTrayDown();
}

