return {
    'akinsho/toggleterm.nvim',
    version = "*",
    keys = { "<C-\\>", "<cmd>ToggleTerm<CR>", desc="Toggle [T]erminal"},
    config = function ()
        local highlights = require('rose-pine.plugins.toggleterm')
        require('toggleterm').setup({
            highlights = highlights,
            open_mapping = "<C-\\>",
            direction = "float"
         })
    end
}
