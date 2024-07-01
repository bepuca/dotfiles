return {
    'nvim-telescope/telescope.nvim',
    tag = '0.1.8',
    dependencies = { 'nvim-lua/plenary.nvim' },
    -- lazy load when telescope is used for the first time
    keys = {
        { '<leader>sh', "<cmd>Telescope help_tags<CR>", desc = '[S]earch [H]elp' },
        { '<leader>sk', "<cmd>Telescope keymaps<CR>", desc = '[S]earch [K]eymaps' },
        { '<leader>sf', "<cmd>Telescope find_files<CR>", desc = '[S]earch [F]iles' },
        { '<leader>ss', "<cmd>Telescope builtin<CR>", desc = '[S]earch [S]elect Telescope' },
        { '<leader>sw', "<cmd>Telescope grep_string<CR>", desc = '[S]earch current [W]ord' },
        { '<leader>sg', "<cmd>Telescope live_grep<CR>", desc = '[S]earch by [G]rep' },
        { '<leader>sd', "<cmd>Telescope diagnostics<CR>", desc = '[S]earch [D]iagnostics' },
        { '<leader>sr', "<cmd>Telescope resume<CR>", desc = '[S]earch [R]esume' },
        { '<leader>s.', "<cmd>Telescope oldfiles<CR>", desc = '[S]earch Recent Files ("." for repeat)' },
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
            '<leader>s/',
            function()
                require("telescope.builtin").live_grep {
                    grep_open_files = true, prompt_title = 'Live Grep in Open Files'
                }
            end,
            desc = '[S]earch [/] in Open Files'
        },
        {
            '<leader>sn',
            function()
                require("telescope.builtin").find_files { cwd = vim.fn.stdpath 'config' }
            end,
            desc = '[S]earch [N]eovim files'
        }
    }
}
