return {
    "nvim-lualine/lualine.nvim",
    dependencies = { "nvim-tree/nvim-web-devicons" },
    event = 'ColorScheme',
    opts = {
        options = {
            --- @usage 'rose-pine' | 'rose-pine-alt'
            theme = 'rose-pine'
          }
    }
}
