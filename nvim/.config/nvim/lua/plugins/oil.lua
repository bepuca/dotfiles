return {
    "stevearc/oil.nvim",
    dependencies = { "nvim-tree/nvim-web-devicons" },
    -- lazy load on first call
    keys = {
        {"-", "<CMD>Oil --float<CR>", { desc = "Open parent directory" }}
    },
    opts = {
        keymaps = {
            ["<TAB>"] = "actions.preview",
            ["-"] = "actions.close",
        },
        view_options = { show_hidden = true },
        float = { preview_split = "right" }
    }
}
