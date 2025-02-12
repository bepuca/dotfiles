-- return {
--     "catppuccin/nvim",
--     lazy = false,
--     name = "catppuccin",
--     priority = 1000,
--     config = function()
--         vim.cmd.colorscheme "catppuccin"
--     end
-- }
-- return {
--     "Shatur/neovim-ayu",
--     lazy = false,
--     priority = 1000,
--     config = function()
--         vim.cmd.colorscheme "ayu-mirage"
--     end
-- }
-- return {
--     "rose-pine/neovim",
--     lazy = false,
--     priority = 1000,
--     config = function()
--         require("rose-pine").setup({
--             groups = {
--                 git_add = "foam",
--                 git_change = "iris",
--                 git_delete = "love",
--                 git_dirty = "iris",
--                 git_ignore = "muted",
--                 git_merge = "iris",
--                 git_rename = "pine",
--                 git_stage = "iris",
--                 git_text = "rose",
--                 git_untracked = "subtle",
--             }
--         })
--         vim.cmd.colorscheme "rose-pine-moon"
--     end
-- }
return {
  {
    "baliestri/aura-theme",
    lazy = false,
    priority = 1000,
    config = function(plugin)
      vim.opt.rtp:append(plugin.dir .. "/packages/neovim")
      vim.cmd([[colorscheme aura-dark]])
    end
  }
}
