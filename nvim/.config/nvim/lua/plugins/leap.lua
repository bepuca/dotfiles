return {
    "https://github.com/ggandor/leap.nvim",
    dependencies = { "tpope/vim-repeat" },
    config = function()
        local leap = require("leap")
        leap.create_default_mappings()
        -- allow ; , to repeat search
        leap.add_repeat_mappings(';', ',', {
            relative_directions = true,
            modes = {'n', 'x', 'o'},
        })
        -- enable auto jump (to first occurence)
        leap.opts.labels = ""
    end
}
