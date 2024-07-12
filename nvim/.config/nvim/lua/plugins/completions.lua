return {
    'hrsh7th/nvim-cmp',
    event = 'InsertEnter',
    dependencies = {
        'hrsh7th/cmp-nvim-lsp',
        'hrsh7th/cmp-path',
    },
    config = function()
        local cmp = require 'cmp'

        cmp.setup {
            completion = { completeopt = 'menu,menuone,noinsert' },

            mapping = cmp.mapping.preset.insert {
                -- Select the [n]ext item
                ['<C-j>'] = cmp.mapping.select_next_item(),
                -- Select the [p]revious item
                ['<C-k>'] = cmp.mapping.select_prev_item(),

                -- Scroll the documentation window [u]p / [d]own
                ['<C-u>'] = cmp.mapping.scroll_docs(-4),
                ['<C-d>'] = cmp.mapping.scroll_docs(4),

                -- Accept the completion.
                ['<TAB>'] = cmp.mapping.confirm { select = true },

            },
            sources = {
                { name = 'nvim_lsp' },
                { name = 'path' },
            },
        }
    end,
}
