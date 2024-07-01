return  {
    "nvim-neo-tree/neo-tree.nvim",
    branch = "v3.x",
    -- define key bind and lazy load on first call
    keys = {
      { "<leader>ft", "<cmd>Neotree toggle<cr>", desc = "NeoTree" },
    },
    dependencies = {
        "nvim-lua/plenary.nvim",
        "nvim-tree/nvim-web-devicons",
        "MunifTanjim/nui.nvim",
    },
    opts = {{
        filtered_items = {
            visible = true,
            hide_dotfiles = false,
            hide_gitignored = false
        },
        follow_current_file = { enabled = true }
    }}
}
