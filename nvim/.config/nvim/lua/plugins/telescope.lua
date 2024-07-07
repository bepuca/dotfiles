return {
    'nvim-telescope/telescope.nvim',
    tag = '0.1.8',
    dependencies = { 'nvim-lua/plenary.nvim' },
    -- lazy load when telescope is used for the first time
    keys = {
        { '<leader>p', "<cmd>Telescope commands<CR>", desc = 'Command [P]alette' },
        { '<leader>fh', "<cmd>Telescope help_tags<CR>", desc = '[F]ind [H]elp' },
        { '<leader>fk', "<cmd>Telescope keymaps<CR>", desc = '[F]ind [K]eymaps' },
        { '<leader>ff', "<cmd>Telescope find_files<CR>", desc = '[F]ind [F]iles' },
        { '<leader>fs', "<cmd>Telescope builtin<CR>", desc = '[F]ind [S]elect Telescope' },
        { '<leader>fw', "<cmd>Telescope grep_string<CR>", desc = '[F]ind current [W]ord' },
        { '<leader>fg', "<cmd>Telescope live_grep<CR>", desc = '[F]ind by [G]rep' },
        { '<leader>fd', "<cmd>Telescope diagnostics<CR>", desc = '[F]ind [D]iagnostics' },
        { '<leader>fr', "<cmd>Telescope resume<CR>", desc = '[F]ind [R]esume' },
        { '<leader>f.', "<cmd>Telescope oldfiles<CR>", desc = '[F]ind Recent Files ("." for repeat)' },
        { '<leader><leader>', "<cmd>Telescope buffers<CR>", desc = '[ ] Find existing buffers' },
        {
            '<leader>/',
            function()
                -- You can pass additional configuration to Telescope to change the theme, layout, etc.
                require("telescope.builtin").current_buffer_fuzzy_find(
                    require('telescope.themes').get_dropdown {
                        winblend = 10,
                        previewer = false,
                    }
                )
            end,
            desc = '[/] Fuzzily search in current buffer'
        },
        {
            '<leader>f/',
            function()
                require("telescope.builtin").live_grep {
                    grep_open_files = true, prompt_title = 'Live Grep in Open Files'
                }
            end,
            desc = '[F]ind [/] in Open Files'
        },
        {
            '<leader>fn',
            function()
                require("telescope.builtin").find_files { cwd = vim.fn.stdpath 'config' }
            end,
            desc = '[F]ind [N]eovim files'
        }
    }
}
