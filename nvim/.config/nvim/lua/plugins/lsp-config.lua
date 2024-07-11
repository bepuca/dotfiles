return {
    "neovim/nvim-lspconfig",
    dependencies = {
        "WhoIsSethDaniel/mason-tool-installer.nvim",
        'nvim-telescope/telescope.nvim',
    },
    -- lazy load when entering a buffer
    event = "BufEnter",
    config = function()
        -- keybindings applied only for buffers that attach an LSP (configured below)
        vim.api.nvim_create_autocmd('LspAttach', {
            group = vim.api.nvim_create_augroup('kickstart-lsp-attach', { clear = true }),
            callback = function(event)
                local map = function(keys, func, desc)
                    vim.keymap.set('n', keys, func, { buffer = event.buf, desc = 'LSP: ' .. desc })
                end

                map('gd', require('telescope.builtin').lsp_definitions, '[G]oto [D]efinition')
                map('gr', require('telescope.builtin').lsp_references, '[G]oto [R]eferences')
                map('<leader>rn', vim.lsp.buf.rename, '[R]e[n]ame')
                map('<leader>ca', vim.lsp.buf.code_action, '[C]ode [A]ction')
                map('K', vim.lsp.buf.hover, 'Hover Documentation')
                map('gD', vim.lsp.buf.declaration, '[G]oto [D]eclaration')
            end
        })

        local lspconfig = require("lspconfig")
        lspconfig.lua_ls.setup({})
        lspconfig.pyright.setup({})
        lspconfig.bashls.setup({})
        lspconfig.ruff.setup({})
    end
}
