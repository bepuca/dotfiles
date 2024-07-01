return {
    "christoomey/vim-tmux-navigator",
    -- lazy load on first call
    keys = {
        { "<C-h>", ":TmuxNavigateLeft<CR>", desc = "Tmux Left"},
        { "<C-j>", ":TmuxNavigateDown<CR>", desc = "Tmux Down"},
        { "<C-k>", ":TmuxNavigateUp<CR>", desc = "Tmux Up"},
        { "<C-l>", ":TmuxNavigateRigh<CR>", desc = "Tmux Right"},
    }
    -- config = function()
    --     vim.keymap.set("n", "<C-h>", ":TmuxNavigateLeft<CR>")
    --     vim.keymap.set("n", "<C-j>", ":TmuxNavigateDown<CR>")
    --     vim.keymap.set("n", "<C-k>", ":TmuxNavigateUp<CR>")
    --     vim.keymap.set("n", "<C-l>", ":TmuxNavigateRigh<CR>")
    -- end
}
