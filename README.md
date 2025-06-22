# Todo Manager GNOME Extension

A simple todo manager extension for GNOME Shell that allows you to manage your todos directly from the top bar.

## Features

- Add new todos
- Mark todos as completed
- Delete todos
- Persistent storage (todos are saved in `~/.todo-list.json`)
- Clean and modern UI that matches GNOME's design

## Installation

1. Create a directory for the extension:

```bash
mkdir -p ~/.local/share/gnome-shell/extensions/todo-manager@m3rashid.github.io
```

2. Copy all the files to the extension directory:

```bash
cp metadata.json extension.js stylesheet.css ~/.local/share/gnome-shell/extensions/todo-manager@m3rashid.github.io/
```

3. Restart GNOME Shell:

   - Press Alt+F2
   - Type 'r' and press Enter
   - Or log out and log back in

4. Enable the extension:
   - Using GNOME Extensions app
   - Or using the command line:
     ```bash
     gnome-extensions enable todo-manager@m3rashid.github.io
     ```

## Usage

1. Click on the checkbox icon in the top bar to open the todo manager
2. Type your todo in the text entry at the top and click the '+' button to add it
3. Click the checkbox next to a todo to mark it as completed
4. Click the '×' button to delete a todo

## Development

To debug the extension, you can:

1. Look at the logs:

```bash
journalctl -f -o cat /usr/bin/gnome-shell
```

2. Use Looking Glass (Alt+F2, then type 'lg' and press Enter)
