 return {
     "nvim-treesitter/nvim-treesitter",
     build = ":TSUpdate",
     event = "BufEnter",
     config = function()
         local config = require("nvim-treesitter.configs")
         config.setup({
             ensure_installed = {"lua", "python", "bash", "vimdoc", "terraform"},
             hightlight = { enable = true },
             indent = { enable = true },
         })
         -- Somehow it does not activate highlight without this
         vim.cmd(":TSEnable highlight")
     end
 }
