//vim: expandtab shiftwidth=4 tabstop=8 softtabstop=4 encoding=utf-8 textwidth=99
/* -*- mode: js2; js2-basic-offset: 4; indent-tabs-mode: nil -*- */

// Some special subclasses of popupMenu
// such that the menu can be opened via a
// particular button only, or via hovering


const Clutter = imports.gi.Clutter;
const Lang = imports.lang;
const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const Params = imports.misc.params;
const PopupMenu = imports.ui.popupMenu;
const Shell = imports.gi.Shell;
const St = imports.gi.St;

const Extension = imports.misc.extensionUtils.getCurrentExtension();
const Lib = Extension.imports.lib;

let settings = Lib.getSettings();

function RightClickPopupMenu() {
    this._init.apply(this, arguments);
}

RightClickPopupMenu.prototype = {
    __proto__: PopupMenu.PopupMenu.prototype,

    _init: function(actor, params) {
        // openOnButton: which button opens the menu
        params = Params.parse(params, { openOnButton: 3 });
        
        /* Modified: Popup on bottom because we use the bottom panel */
        PopupMenu.PopupMenu.prototype._init.call(this, actor, 0, St.Side.BOTTOM);
        
        this.openOnButton = params.openOnButton;
        this._parentActor = actor;
        this._parentActor.connect('button-release-event', Lang.bind(this, this._onParentActorButtonRelease));
        
        this.actor.hide();
        Main.uiGroup.add_actor(this.actor);
    },

    _onParentActorButtonRelease: function(actor, event) {
        let buttonMask = Clutter.ModifierType['BUTTON' + this.openOnButton + '_MASK'];
        if (event.get_state() & buttonMask) {
            this.toggle();
        }
        
    }
};


function HoverMenuController() {
    this._init.apply(this, arguments);
}

HoverMenuController.prototype = {
    _init: function(actor, menu, params) {
        // reactive: should the menu stay open if your mouse is above the menu
        // clickShouldImpede: if you click actor, should the menu be prevented from opening
        // clickShouldClose: if you click actor, should the menu close
        params = Params.parse(params, { reactive: true,
                                        clickShouldImpede: true,
                                        clickShouldClose: true });
        
        this._parentActor = actor;
        this._parentMenu = menu;

        this._parentActor.reactive = true;
        this._parentActor.connect('enter-event', Lang.bind(this, this._onEnter));
        this._parentActor.connect('leave-event', Lang.bind(this, this._onLeave));

        // If we're reactive, it means that we can move our mouse to the popup
        // menu and interact with it.  It shouldn't close while we're interacting
        // with it.
        if (params.reactive) {
            this._parentMenu.actor.connect('enter-event', Lang.bind(this, this._onParentMenuEnter));
            this._parentMenu.actor.connect('leave-event', Lang.bind(this, this._onParentMenuLeave));
        }

        if (params.clickShouldImpede || params.clickShouldClose) {
            this.clickShouldImpede = params.clickShouldImpede;
            this.clickShouldClose = params.clickShouldClose;
            this._parentActor.connect('button-press-event', Lang.bind(this, this._onButtonPress));
        }
    },

    _onButtonPress: function() {
        if (this.clickShouldImpede) {
            this.shouldOpen = false;
        }
        if (this.clickShouldClose) {
            if (!this.impedeClose) {
                this.shouldClose = true;
            }
            this.close();
        }
    },

    _onParentMenuEnter: function() {
        this.shouldClose = false;
    },

    _onParentMenuLeave: function() {
        this.shouldClose = true;

        Mainloop.timeout_add(settings.get_int ("hover-menu-timeout"), Lang.bind(this, this.close));
    },

    _onEnter: function() {
        if (!this.impedeOpen) {
            this.shouldOpen = true;
        }
        this.shouldClose = false;

        Mainloop.timeout_add(settings.get_int ("hover-menu-timeout"), Lang.bind(this, this.open));
    },

    _onLeave: function() {
        if (!this.impedeClose) {
            this.shouldClose = true;
        }
        this.shouldOpen = false;

        Mainloop.timeout_add(settings.get_int ("hover-menu-timeout"), Lang.bind(this, this.close));
    },

    open: function() {
        if (this.shouldOpen && !this._parentMenu.isOpen) {
            this._parentMenu.open(true);
        }
    },

    close: function() {
        if (this.shouldClose) {
            this._parentMenu.close(true);
        }
    },

    enable: function() {
        this.impedeOpen = false;
    },

    disable: function() {
        this.impedeOpen = true;
    }
};

function HoverMenu() {
    this._init.apply(this, arguments);
}

HoverMenu.prototype = {
    __proto__: PopupMenu.PopupMenu.prototype,

    _init: function(actor, params) {
        PopupMenu.PopupMenu.prototype._init.call(this, actor, 0, St.Side.BOTTOM);

        params = Params.parse(params, { reactive: true });

        this._parentActor = actor;

        this.actor.hide();
        
        if (params.reactive) {
            Main.layoutManager.addChrome(this.actor);
        } else {
            Main.uiGroup.add_actor(this.actor);
        }
    }
};

function AppThumbnailHoverMenu() {
    this._init.apply(this, arguments);
}

AppThumbnailHoverMenu.prototype = {
    __proto__: HoverMenu.prototype,

    _init: function(actor, metaWindow, app) {
        HoverMenu.prototype._init.call(this, actor, { reactive: true });

        this.metaWindow = metaWindow;
        this.app = app;

        this.appSwitcherItem = new PopupMenuAppSwitcherItem(this.metaWindow, this.app);
        this.addMenuItem(this.appSwitcherItem);
    },

    open: function(animate) {
        this.appSwitcherItem._refresh();
        PopupMenu.PopupMenu.prototype.open.call(this, animate);
    }
}

function RightClickAppPopupMenu() {
    this._init.apply(this, arguments);
}

RightClickAppPopupMenu.prototype = {
    __proto__: RightClickPopupMenu.prototype,

    _init: function(actor, metaWindow, app, params) {
        RightClickPopupMenu.prototype._init.call(this, actor, params);
        
        this.metaWindow = metaWindow;
        this.app = app;

        /* Modified: Use window-title CSS class to make a bold title - looks better */
        this._menuItemName = new PopupMenu.PopupMenuItem(this.app.get_name(), { style_class: 'window-title', reactive: false });
        this.addMenuItem(this._menuItemName);

        this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._menuItemCloseWindow = new PopupMenu.PopupMenuItem('Close');
        this._menuItemCloseWindow.connect('activate', Lang.bind(this, this._onMenuItemCloseWindowActivate));
        this.addMenuItem(this._menuItemCloseWindow);
        
        this._menuItemMinimizeWindow = new PopupMenu.PopupMenuItem('Minimize');
        this._menuItemMinimizeWindow.connect('activate', Lang.bind(this, this._onMenuItemMinimizeWindowActivate));
        this.addMenuItem(this._menuItemMinimizeWindow);
        
        this._menuItemMaximizeWindow = new PopupMenu.PopupMenuItem('Maximize');
        this._menuItemMaximizeWindow.connect('activate', Lang.bind(this, this._onMenuItemMaximizeWindowActivate));
        this.addMenuItem(this._menuItemMaximizeWindow)
    },

    _onMenuItemMaximizeWindowActivate: function() {
        // "3" is the the MetaMaximizeFlags parameter; 1 << 0 for horizontal, 1 << 1 for vertical
        this.metaWindow.unminimize();
        this.metaWindow.maximize(3);
        this.metaWindow.activate(global.get_current_time());
    },

    _onMenuItemMinimizeWindowActivate: function() {
        this.metaWindow.minimize();
    },

    _onMenuItemCloseWindowActivate: function() {
    
        // Modified: close the Window, not the app
        this.metaWindow.delete(global.get_current_time());
    },

    open: function(animate) {
        // Dynamically generate the thumbnail when we open the menu since
        // when extensions first load, the thumbnail is unavailable
        this.generateThumbnail();
        RightClickPopupMenu.prototype.open.call(this, animate);
    },

    generateThumbnail: function() {
        // If we already made a thumbnail, we don't need to make it again
        if (this.thumbnail) {
            return;
        }

        // Get a pretty thumbnail of our app
        let mutterWindow = this.metaWindow.get_compositor_private();
        if (mutterWindow) {
            let windowTexture = mutterWindow.get_texture();
            let [width, height] = windowTexture.get_size();
            let scale = Math.min(1.0, settings.get_int ("thumbnail-default-size") / width, settings.get_int ("thumbnail-default-size") / height);
            this.thumbnail = new Clutter.Clone ({ source: windowTexture,
                                                  reactive: true,
                                                  width: width * scale,
                                                  height: height * scale });

            this.thumnailMenuItem = new PopupMenuThumbnailItem(this.thumbnail);
            this.addMenuItem(this.thumnailMenuItem);
            this.thumnailMenuItem.connect('activate', Lang.bind(this, function() {
                this.metaWindow.activate(global.get_current_time());
            }));
        }
    }
};

function PopupMenuThumbnailItem() {
    this._init.apply(this, arguments);
}

PopupMenuThumbnailItem.prototype = {
    __proto__: PopupMenu.PopupBaseMenuItem.prototype,

    _init: function (image, params) {
        PopupMenu.PopupBaseMenuItem.prototype._init.call(this, params);

        this.image = image;
        this.addActor(this.image);
    }
};

// display a list of app thumbnails and allow
// bringing any app to focus by clicking on its thumbnail
function PopupMenuAppSwitcherItem() {
    this._init.apply(this, arguments);
}

PopupMenuAppSwitcherItem.prototype = {
    __proto__: PopupMenu.PopupBaseMenuItem.prototype,

    _init: function (metaWindow, app, params) {
        params = Params.parse(params, { hover: false });
        PopupMenu.PopupBaseMenuItem.prototype._init.call(this, params);
        
        this.metaWindow = metaWindow;
        this.app = app;
        
        this.appContainer = new St.BoxLayout({ style_class: 'app-window-switcher',
                                               reactive: true,
                                               track_hover: true,
                                               can_focus: true,
                                               vertical: false });

        this.metaWindowThumbnail = new WindowThumbnail(this.metaWindow, this.app);
        this._connectToWindowOpen(this.metaWindowThumbnail.actor, this.metaWindow);
        this.appContainer.add_actor(this.metaWindowThumbnail.actor);
        this.appThumbnails = {};

        this.divider = new St.Bin({ style_class: 'app-window-switcher-divider',
                                   y_fill: true });
        this.appContainer.add_actor(this.divider);

        this.addActor(this.appContainer);
    },

    _connectToWindowOpen: function(actor, metaWindow) {
        actor.connect('button-release-event', Lang.bind(this, function() {
            metaWindow.activate(global.get_current_time());
        }));
    },

    _refresh: function() {
        this.metaWindowThumbnail._refresh();

        // Get a list of all windows of our app that are running in the current workspace
        let windows = this.app.get_windows().filter(Lang.bind(this, function(win) { 
                                                            let isDifferent =  (win != this.metaWindow);
                                                            let isSameWorkspace = (win.get_workspace() == this.metaWindow.get_workspace());
                                                            return isDifferent && isSameWorkspace;
                                                    }));
        // Update appThumbnails to include new programs
        windows.forEach(Lang.bind(this, function(metaWindow) {
            if (this.appThumbnails[metaWindow]) {
                this.appThumbnails[metaWindow].thumbnail._refresh();
            } else {
                let thumbnail = new WindowThumbnail(metaWindow, this.app);
                this.appThumbnails[metaWindow] = { metaWindow: metaWindow,
                                                   thumbnail: thumbnail };
                this.appContainer.add_actor(this.appThumbnails[metaWindow].thumbnail.actor);
                this._connectToWindowOpen(this.appThumbnails[metaWindow].thumbnail.actor, metaWindow);
            }
        }));
        
        // Update appThumbnails to remove old programs
        for (let win in this.appThumbnails) {
            if (windows.indexOf(this.appThumbnails[win].metaWindow) == -1) {
                this.appContainer.remove_actor(this.appThumbnails[win].thumbnail.actor);
                this.appThumbnails[win].thumbnail.destroy();
                delete this.appThumbnails[win];
            }
        }

        // Show the divider if there is more than one window belonging to this app
        if (Object.keys(this.appThumbnails).length > 0) {
            this.divider.show();
        } else {
            this.divider.hide();
        }
    }
};

function WindowThumbnail() {
    this._init.apply(this, arguments);
}

WindowThumbnail.prototype = {
    _init: function (metaWindow, app, params) {
        this.metaWindow = metaWindow
        this.app = app

        // Inherit the theme from the alt-tab menu
        this.actor = new St.BoxLayout({ style_class: 'window-thumbnail',
                                        reactive: true,
                                        can_focus: true,
                                        vertical: true });
        this.thumbnailActor = new St.Bin({ y_fill: false,
                                           y_align: St.Align.MIDDLE });
        this.thumbnailActor.height = settings.get_int ("thumbnail-default-size");
        this.titleActor = new St.Label();
        //TODO: should probably do this in a smarter way in the get_size_request event or something...
        //fixing this should also allow the text to be centered
        this.titleActor.width = settings.get_int ("thumbnail-default-size");

        this.actor.add(this.thumbnailActor);
        this.actor.add(this.titleActor);
        this._refresh();

        // the thumbnail actor will automatically reflect changes in the window
        // (since it is a clone), but we need to update the title when it changes
        this.metaWindow.connect('notify::title', Lang.bind(this, function(){
                                                    this.titleActor.text = this.metaWindow.get_title();
                                }));
        this.actor.connect('enter-event', Lang.bind(this, function() {
                                                        this.actor.add_style_pseudo_class('hover');
                                                        this.actor.add_style_pseudo_class('selected');
                                                    }));
        this.actor.connect('leave-event', Lang.bind(this, function() {
                                                        this.actor.remove_style_pseudo_class('hover');
                                                        this.actor.remove_style_pseudo_class('selected');
                                                    }));
    },

    destroy: function() {
        this.actor.destroy();
    },

    needs_refresh: function() {
        return Boolean(this.thumbnail);
    },

    _getThumbnail: function() {
        // Create our own thumbnail if it doesn't exist
        if (this.thumbnail) {
            return this.thumbnail;
        }

        let thumbnail = null;
        let mutterWindow = this.metaWindow.get_compositor_private();
        if (mutterWindow) {
            let windowTexture = mutterWindow.get_texture();
            let [width, height] = windowTexture.get_size();
            let scale = Math.min(1.0, settings.get_int ("thumbnail-default-size") / width, settings.get_int ("thumbnail-default-size") / height);
            thumbnail = new Clutter.Clone ({ source: windowTexture,
                                             reactive: true,
                                             width: width * scale,
                                             height: height * scale });
        }

        return thumbnail;
    },

    _refresh: function() {
        // Replace the old thumbnail
        this.thumbnail = this._getThumbnail();
        
        this.thumbnailActor.child = this.thumbnail;
        this.titleActor.text = this.metaWindow.get_title();
    }
};
